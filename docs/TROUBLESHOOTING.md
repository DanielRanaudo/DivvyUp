# Troubleshooting & ops notes

Things that actually came up running this, with the diagnosis that ended each
one. Symptom → cause → fix.

## Setup and runtime

**`Could not find a relationship between 'groups' and 'group_periods' in the
schema cache`** — groups fail to load right after pulling code that expects the
period columns. The migrations exist locally but were never applied to the
linked Supabase project, so the app and the remote schema are out of sync. Push
them:

```bash
npx supabase login && npx supabase link --project-ref <ref>
npx supabase db push --include-all
```

After pulling schema changes, push migrations before expecting the app to work
against a remote database. The `db:*` scripts call `npx --yes supabase`, so no
global CLI install is needed.

**App stuck forever on a grey "Loading…"** — the page returns 200 but the UI
never renders. A dropped or flaky network left `getSession()` and the initial
group fetch pending indefinitely; both gated the shell with no timeout and
logged nothing useful. Fixed with `withTimeout`
([src/lib/utils.ts:69](../src/lib/utils.ts#L69)): the group load times out at
~15s and surfaces a save-error banner, the auth session read times out at ~10s
and falls through to login. Lesson: never gate the whole shell on an unbounded
network promise.

**`TypeError: fetch failed` / `getaddrinfo ENOTFOUND *.supabase.co`** — the dev
console floods with failed requests to Supabase. This is a transient local
DNS/network hop (the machine's hostname changing mid-session will do it), **not
an application bug**. Recheck connectivity and restart `npm run dev` once the
network settles; no code change applies.

**Hydration overlay on `<body>` (`data-gr-ext-installed`,
`data-new-gr-c-s-check-loaded`)** — the red "tree hydrated but attributes didn't
match" overlay in dev. Grammarly and similar browser extensions inject
attributes onto `<body>` before React hydrates. Fixed with
`suppressHydrationWarning` on `<body>` in
[src/app/layout.tsx:62](../src/app/layout.tsx#L62) — body-only, so genuine child
mismatches still report. Worth knowing before chasing a phantom SSR bug.

**Undo → Split forgot the previous custom split** — after approving a custom
split, hitting Undo and reopening Split started over from an even split.
`reopenExpense` deliberately clears `splits`/`splitMode` so a pending expense
stops moving balances, and `draftFromExpense` existed to recover the prior
answer but was never wired into the UI, so it was discarded before the dialog
opened. Fixed by capturing the draft at Undo time and passing it as
`initialDraft` to `SplitExpenseDialog`
([ExpensesTab.tsx:155](../src/components/tabs/ExpensesTab.tsx#L155)); the
remembered draft is cleared if the amount is edited while pending. Covered by an
e2e smoke test.

Flexible splits live under **Expenses → Split**, available to the treasurer on
pending expenses: *Evenly*, *Some of us*, *Amounts*, *Percent*.

## CI

**`npm ci` fails with `Missing: @emnapi/core@1.11.1 from lock file`** —
installs fine locally, refuses on CI. `@rolldown/binding-wasm32-wasi` pins
`@emnapi/core` and `@emnapi/runtime` to exactly `1.11.1`, which the hoisted
`1.11.3` does not satisfy, so the tree needs nested copies under it. The
lockfile recorded that package's other nested dependencies but not those two.
npm 11.6 installs from the inconsistent lockfile anyway; npm 10 and npm 11.17
both refuse. Fix is `npm install --package-lock-only` and commit the result.
Reproduce CI exactly with:

```bash
docker run --rm -v "$PWD":/app -w /app node:24 npm ci
```

**pgTAP failures that name the right SQLSTATE but the wrong message** — e.g.
`caught: 42501: new row violates row-level security policy` /
`wanted: 42501: a member cannot insert an already-approved expense`. pgTAP
resolves `throws_ok` by argument shape: a five-character second argument binds
the SQLSTATE overload, making the **third** argument the expected *error
message* rather than the test description. Pass `null::text` for the message and
move the description to the fourth slot. The code matching means the policy was
working — the test was the thing that was wrong.

**Lint fails on `supabase/.temp/.../index.ts` after running the database
tests** — `supabase start` writes a generated edge-runtime file there. It is
gitignored, so CI never sees it, but ESLint's flat config does not read
`.gitignore`. Already handled by the ignore entry in `eslint.config.mjs`.

## Hardening

Holes found in a production-readiness audit and closed since:

- **Realtime refetch could clobber in-flight optimistic edits** → pending writes
  are tracked and realtime refetches deferred while any are outstanding.
- **Rapid edits could apply out of order** → `persistGroupDiff` is serialized per
  group.
- **Concurrent multi-tab or multi-roommate edits overwrote silently** →
  `docs_version` counter, stale `update_group_docs` calls rejected, and a
  reload-on-conflict path in the UI.
- **Member removal left stale rent, utility, chore, and sub-group state** →
  tested `removeMember()` cleanup, and removal is blocked while the balance is
  non-zero.
- **RLS and money-integrity holes** — non-treasurers could escalate, clients
  could insert already-approved expenses and payments, update policies were too
  broad, receipts were public, invite codes were short → column-guard triggers,
  force-pending inserts, `SECURITY DEFINER` approve/deny/confirm RPCs, amount
  `CHECK`s, private receipts behind signed URLs, longer invite codes.
- **Missing production env validation** → a production build throws if the
  Supabase env vars are absent; sandbox shows a demo-mode banner.

## For maintainers

Shipping a11y changes broke Playwright selectors — tab buttons gained an
"— needs attention" suffix, so exact accessible-name matches failed, and
visually-hidden checkboxes need keyboard `Space` rather than `.uncheck()`.
Prefer count and role assertions over matching money text.
