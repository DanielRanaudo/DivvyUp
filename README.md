# DivvyUp

**Shared-expense management for houses too big for a group chat.**

[![CI](https://github.com/DanielRanaudo/DivvyUp/actions/workflows/ci.yml/badge.svg)](https://github.com/DanielRanaudo/DivvyUp/actions/workflows/ci.yml)
![Next.js 16](https://img.shields.io/badge/Next.js-16-000000)
![React 19](https://img.shields.io/badge/React-19-149eca)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)
![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20RLS-3ecf8e)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow)

Rent, utilities, groceries, and chores split across a ten-person house — with an
approval trail, minimized settlement payments, a monthly close-out, and live sync
between everyone's phones. Built for households too large for Splitwise-style
apps: unequal rent, sub-groups, a treasurer, and ten people editing at once.

```bash
npm install && npm run sandbox   # full demo, nine fake roommates, no signup
```

---

## Features

**Money** — rent (equal, percentage, or custom per person, recurring monthly) ·
one-off and recurring bills · roommate-fronted expenses with receipt photos and
treasurer approval · four split modes (even, subset, exact, percentage), all
penny-exact so balances net to zero · sub-groups ("floors") with their own
members and bills · settlement engine that minimizes the *number* of transfers,
not just the totals · two-sided payment confirmation · monthly close-out with a
compressed carry-forward ledger and browsable archive · CSV export · Venmo/Zelle
handles surfaced next to what you owe.

**Household** — chores with fixed or round-robin assignment, repeat intervals,
and a projected calendar · dashboard of your balance, what's due, and what's
waiting on you · multi-group membership by invite code · treasurer role that can
be handed off · member removal that blocks on open balances and re-splits rent ·
daily digest emails · profiles mirrored across every group you're in.

**Product** — installable mobile-first PWA · realtime sync · optimistic UI with
rollback · backend-free demo mode with a user switcher · accessibility (focus
traps, ARIA live regions, `prefers-reduced-motion`) · deep-linkable URLs.

---

## Engineering highlights

### Authorization lives in Postgres, not the client

The browser talks to Supabase directly, so every authorization decision is
enforced by row-level security and `SECURITY DEFINER` RPCs:

- Members read only their own groups; rent and bills are treasurer-only writes;
  payments are confirmable only by the recipient.
- Sensitive transitions are RPCs, validated server-side — `approve_expense`
  re-derives splits and checks they sum to the amount within a cent,
  `confirm_payment` refuses amount changes mid-confirmation, `transfer_treasurer`
  is the only path to the role.
- A column-guard trigger blocks members from editing protected fields on their
  own membership row, `is_treasurer` above all.
- Invite codes are 10 CSPRNG characters over an unambiguous 32-symbol alphabet,
  with failed lookups rate-limited per user and wrong codes returning null.

A hardening migration closed real holes in the baseline schema — self-promotion
to treasurer, inserting a pre-approved expense, choosing your own splits. Each
one now has a test proving it stays closed.

### Tests that assert the attacks fail

| Layer | Tool | Covers |
|---|---|---|
| **209 unit tests** (16 files) | Vitest | Money logic — splits, settlements, chore rotation, close-out, member removal, CSV escaping — plus diff-based persistence against a fake Supabase client |
| **11 browser tests** | Playwright | The full household path: front an expense, approve, settle, confirm, close the month |
| **59 database assertions** | pgTAP | Authorization from an ordinary member's session: every privilege escalation and concurrent-write attack fails |

All three run in GitHub Actions on every push and PR, alongside lint, typecheck,
and a production build.

### Concurrency for a house of ten

Chores and sub-groups are JSON documents carrying a **version counter** — the
client sends the version it read and Postgres rejects the write if the document
moved on, so simultaneous edits surface a refetch instead of silently losing one.
Realtime has the mirror problem, so incoming refetches are deferred while a local
write is pending and event bursts are debounced into one.

### State and persistence

Group state lives in React and is written through to Supabase as a **diff**
(`persistGroupDiff` in [src/lib/api.ts](src/lib/api.ts)): compare next state
against last known server state, emit the minimal set of operations, roll the UI
back if any fail. Writes are serialized so two saves can't interleave.

### Security beyond auth

Strict CSP plus HSTS, `X-Frame-Options: DENY`, `nosniff`, and a locked-down
`Permissions-Policy` · receipts in a private bucket served through short-lived
signed URLs · CSV formula-injection defense · timing-safe cron token comparison ·
fail-closed config (a production build with missing env vars throws rather than
shipping an in-memory demo) · Sentry reports carrying user id only.

---

## Tech stack

| | |
|---|---|
| **Framework** | Next.js 16 (App Router, Turbopack, Proxy middleware for session refresh) |
| **UI** | React 19, TypeScript (strict), Tailwind v4, hand-rolled design tokens |
| **Backend** | Supabase — Postgres, RLS, `SECURITY DEFINER` RPCs, Realtime, Storage, Auth |
| **Testing** | Vitest, Playwright, pgTAP |
| **Ops** | GitHub Actions CI, Vercel (+ Cron), Sentry, Resend SMTP, Dependabot |

~17k lines of TypeScript and ~2.5k lines of SQL, hand-written across six migrations.

---

## Run it

**Demo mode — no backend, no signup:**

```bash
npm install
npm run sandbox    # nine fake roommates, in-memory data, user switcher
```

Open [http://localhost:3000](http://localhost:3000). The header's user switcher
lets you submit an expense as one roommate and approve it as the treasurer.

**With a real backend:**

1. Create a project at [supabase.com](https://supabase.com).
2. `npx supabase link --project-ref <ref>` then `npm run db:push` to apply
   migrations (tables, RLS, RPCs, storage buckets, realtime publication).
3. Copy `.env.example` to `.env.local` and fill in the project URL and anon key.
4. In **Authentication → URL Configuration**, set the site URL and add
   `/reset-password` as a redirect URL.
5. `npm run dev`.

| Script | Purpose |
|--------|---------|
| `npm run dev` / `npm run sandbox` | Dev server (backend / demo mode) |
| `npm test` / `npm run test:e2e` / `npm run db:test` | Vitest / Playwright / pgTAP |
| `npm run db:push` / `npm run db:reset` | Apply migrations / rebuild local DB |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run build` | Production build |

---

## Troubleshooting & ops notes

Things that actually came up running this, with the diagnosis that ended each
one. Symptom → cause → fix.

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
([src/lib/utils.ts:69](src/lib/utils.ts#L69)): the group load times out at ~15s
and surfaces a save-error banner, the auth session read times out at ~10s and
falls through to login. Lesson: never gate the whole shell on an unbounded
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
[src/app/layout.tsx:62](src/app/layout.tsx#L62) — body-only, so genuine child
mismatches still report. Worth knowing before chasing a phantom SSR bug.

**Undo → Split forgot the previous custom split** — after approving a custom
split, hitting Undo and reopening Split started over from an even split.
`reopenExpense` deliberately clears `splits`/`splitMode` so a pending expense
stops moving balances, and `draftFromExpense` existed to recover the prior
answer but was never wired into the UI, so it was discarded before the dialog
opened. Fixed by capturing the draft at Undo time and passing it as
`initialDraft` to `SplitExpenseDialog`
([ExpensesTab.tsx:155](src/components/tabs/ExpensesTab.tsx#L155)); the
remembered draft is cleared if the amount is edited while pending. Covered by an
e2e smoke test.

Flexible splits live under **Expenses → Split**, available to the treasurer on
pending expenses: *Evenly*, *Some of us*, *Amounts*, *Percent*.

### Hardening

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

**For maintainers:** shipping a11y changes broke Playwright selectors — tab
buttons gained an "— needs attention" suffix, so exact accessible-name matches
failed, and visually-hidden checkboxes need keyboard `Space` rather than
`.uncheck()`. Prefer count and role assertions over matching money text.

---

## Project structure

```
src/
├── app/            # App Router: auth gating, reminders cron route, password reset
├── components/     # AppShell, screens/, tabs/, dashboard/, expenses/, periods/
├── context/        # Supabase session provider
├── hooks/          # Group store (optimistic writes), realtime, URL routing
└── lib/            # settlements · splits · charges · periods · members · chores
                    # · csv · reminders · receipts · api (diff persistence)
e2e/                # Playwright smoke tests (sandbox mode)
supabase/
├── migrations/     # Tables, RLS, RPCs, storage, realtime
└── tests/          # pgTAP suites proving the RLS rules hold
```

---

## Deployment

Deployed on [Vercel](https://vercel.com): import the repo, set
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and add the
production domain to Supabase's auth URL configuration. `vercel.json` schedules
the daily reminder job; auth emails go through [Resend](https://resend.com) SMTP.
Sentry and reminder emails are optional — without their env vars the app runs
normally. Migrations are append-only and safe to re-run.

---

## License

MIT © Daniel Ranaudo
