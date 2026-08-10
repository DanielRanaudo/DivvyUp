# DivvyUp

**Shared-expense management for houses too big for a group chat.**

[![CI](https://github.com/DanielRanaudo/DivvyUp/actions/workflows/ci.yml/badge.svg)](https://github.com/DanielRanaudo/DivvyUp/actions/workflows/ci.yml)
![Next.js 16](https://img.shields.io/badge/Next.js-16-000000)
![React 19](https://img.shields.io/badge/React-19-149eca)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)
![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20RLS-3ecf8e)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow)

Rent, utilities, groceries, and the guy who always covers the Costco run — split
across ten roommates, with an approval trail, one-tap settlements, a monthly
close-out, and live sync between everyone's phones.

```bash
npm install && npm run sandbox   # full demo, nine fake roommates, no signup
```

---

## Why I built it

I'm moving into a house with **ten people**. Ten people means ten Venmo
requests per bill, one person fronting the utility company every month and
chasing everyone else for it, and a group chat where "I'll get you back" goes to
die. Splitwise-style apps assume a couple of roommates and one kind of expense;
they don't handle a treasurer, a rent split that isn't equal because the rooms
aren't equal, bills that only the second floor shares, or a chore rotation.

DivvyUp is what I actually wanted for that house: one place where the house's
money lives, where nobody is stuck being the bank, and where at the end of the
month the whole thing zeroes out in as few payments as mathematically possible.

Scale is the design constraint everywhere. Ten people settling naively is up to
45 separate payments; the settlement engine gets a typical month down to a
handful. Ten people editing at once is a race condition, so writes are versioned
and rejected server-side rather than silently overwriting each other.

---

## Features

### Money

- **Rent** — equal, percentage, or custom per-person amounts (the corner
  bedroom pays more), recurring automatically each month.
- **Utilities & recurring bills** — one-off or monthly, split any way, with the
  person who fronted it credited.
- **Shared expenses** — anyone can front money and submit it with a receipt
  photo; it becomes a real debt only once the treasurer approves it.
- **Four split modes per expense** — evenly across the house, evenly across only
  the people who shared it, exact dollar amounts, or percentages. Every mode is
  **penny-exact**: leftover cents are distributed deterministically so balances
  always net to exactly zero, with no drift.
- **Sub-groups ("floors")** — a subset of the house with its own members and
  its own bills, for the four people who share a bathroom or a Netflix login.
- **Smart settlements** — a greedy debtor/creditor matching algorithm that
  minimizes the *number of transfers* needed to square the house, not just the
  totals. Toggleable back to simple pairwise "who owes whom" if the house
  prefers that.
- **Payment confirmation loop** — you mark a payment sent, the recipient
  confirms it was received. Nothing moves a balance on one person's say-so.
- **Monthly close-out** — the treasurer closes a month: one-off expenses,
  payments, and bills are archived, whatever is still owed is compressed into a
  short carry-forward ledger, and rent and recurring bills re-charge for the new
  month. Keeps the app fast in month 24 instead of dragging two years of
  receipts down the wire on every load.
- **Past-months archive** — closed months are browsable a page at a time, with
  their totals preserved.
- **CSV export** — any month, open or archived, downloads as a spreadsheet of
  expenses and payments.
- **Payment handles** — Venmo and Zelle stored per person and surfaced right
  next to the amount you owe them.

### Household

- **Chores** — fixed assignee or round-robin rotation, custom repeat interval,
  emoji icons, completion history, and a projected calendar of who has what for
  the next several weeks.
- **Dashboard** — your net balance, what you owe and who owes you, recent
  charges, chores due, and payments waiting on your confirmation.
- **Groups** — create a house, share an invite code, join by code, belong to
  several houses at once and switch between them.
- **Treasurer role** — controls rent, bills, and expense approvals, and can hand
  the role to someone else.
- **Safe member removal** — you can't remove a roommate who still has an open
  balance; when they do leave, rent is re-split among the people actually living
  there and the treasurer is told exactly what changed. Past charges keep their
  original splits as an accurate record.
- **Daily reminder emails** — a cron job emails each person one digest of the
  expenses awaiting their approval and payments awaiting their confirmation,
  with a 24-hour grace period so nobody gets nagged the same evening.
- **Profiles** — avatar, Venmo, Zelle, email change; contact details are mirrored
  into every group you're in, so editing them once updates all of them.

### Product polish

- **Installable PWA** — mobile-first, standalone display, home-screen icons.
  It's used standing in a kitchen, not at a desk.
- **Realtime sync** — a roommate's edit shows up on your screen without a
  refresh.
- **Optimistic UI** — every action lands instantly and rolls back with a toast
  if the server rejects it.
- **Offline-free demo mode** — the entire app runs with no backend and no
  signup, with a user switcher for viewing the house as any roommate.
- **Accessibility** — focus traps in every modal, keyboard-navigable dialogs,
  `:focus-visible` rings, ARIA labels and live regions, and
  `prefers-reduced-motion` support.
- **Deep-linkable URLs** — the current screen, tab, and group live in the query
  string, so the back button works and links are shareable.

---

## Engineering highlights

The parts I'd want to talk through in an interview.

### Authorization lives in Postgres, not in the client

The browser talks to Supabase directly, so **any client-side check is a
suggestion, not a rule**. Every authorization decision is enforced by Postgres
row-level security and `SECURITY DEFINER` RPCs:

- Members can only read groups they belong to; rent and bills are treasurer-only
  writes; expenses require treasurer approval; payments are confirmable only by
  the person who received the money.
- Sensitive state transitions are RPCs rather than table updates, so the
  transition itself is validated server-side — `approve_expense` re-derives the
  splits and checks they sum to the amount within a cent, `confirm_payment`
  refuses to let the amount change while it's being confirmed, and
  `transfer_treasurer` is the only path to the role.
- A column-guard trigger stops a member from editing fields on their own
  membership row that they aren't allowed to touch, `is_treasurer` above all.
- Invite codes are 10 characters drawn from a CSPRNG over an unambiguous
  32-symbol alphabet (no bias, no `0`/`O` confusion), and guessing is
  rate-limited: failed lookups are recorded per user and throttled after ten in
  an hour, with a wrong code returning null rather than confirming whether it
  exists.

The security-hardening migration exists because the baseline schema had real,
exploitable holes — self-promotion to treasurer, inserting a pre-approved
expense, choosing your own splits, editing a payment's amount while confirming
it. Each one is now closed **and has a test that proves it stays closed**.

### Tests that assert the attacks fail

Three layers, because the risk lives in three different places.

| Layer | Tool | What it covers |
|---|---|---|
| **209 unit tests** across 16 files | Vitest | The money logic — splits, settlement algorithms, chore rotations, monthly close-out, member removal, CSV escaping — plus the persistence diff, tested against a fake Supabase client that records the calls it receives |
| **11 browser tests** | Playwright | The path a household actually walks: front an expense, approve it, settle the debt, confirm the payment, close the month. Runs against a sandbox build, so there's no project to provision and nothing to clean up |
| **59 database assertions** | pgTAP | Authorization, from an ordinary member's session: you cannot promote yourself, insert an approved expense, choose your own splits, edit an amount mid-confirmation, or clobber a roommate's simultaneous edit |

All three run in **GitHub Actions on every push and PR**, alongside lint,
typecheck, and a production build — the database job spins up a throwaway
Postgres, applies every migration, and runs the pgTAP suites against it.

### Concurrency, for a house of ten

Chores and sub-groups are stored as JSON documents, which meant two roommates
editing different chores at once silently discarded one of them. They now carry
a **version counter**: the client sends the version it read, and Postgres refuses
the write if the document has moved on. The client refetches and says so instead
of losing the edit without a word.

Realtime has the mirror-image problem — a roommate's change arriving mid-save
would clobber the write in flight — so incoming refetches are **deferred while a
local write is pending**, and a burst of events from one action is debounced into
a single refetch.

### State and persistence

Group state is held in React and written through to Supabase as a **diff**
(`persistGroupDiff` in [src/lib/api.ts](src/lib/api.ts)): the store compares the
next group against the last known server state, emits the minimal set of
operations, and rolls the UI back to server state if any of them fail. Writes are
serialized so two in-flight saves can't interleave.

### Security engineering beyond auth

- **Strict Content Security Policy**, plus HSTS, `X-Frame-Options: DENY`,
  `nosniff`, a locked-down `Permissions-Policy`, and referrer policy — with the
  Supabase origin (and its WebSocket scheme) allowlisted explicitly.
- **Private receipt storage.** Receipts are compressed client-side, uploaded to a
  private bucket keyed by group, and served through short-lived signed URLs.
  Storing a public URL would be storing a credential that never expires.
- **CSV injection defense.** A roommate who names an expense `=cmd|...` would
  otherwise be writing a formula into everyone's download; exported fields
  starting with `=`, `+`, `-`, or `@` are quoted.
- **Timing-safe cron auth.** The reminder endpoint compares its bearer token
  without leaking, through timing, how much of the secret matched.
- **Fail-closed configuration.** A production build with missing Supabase env
  vars *throws at build time* rather than silently shipping an in-memory demo
  that accepts a month of rent and stores none of it.
- **Privacy-conscious error tracking.** Sentry reports carry the user id only —
  never emails, never payment handles.

---

## Tech stack

| | |
|---|---|
| **Framework** | Next.js 16 (App Router, Turbopack, Proxy/middleware for session refresh) |
| **UI** | React 19, TypeScript (strict), Tailwind v4, a hand-rolled design-token system |
| **Backend** | Supabase — Postgres, row-level security, `SECURITY DEFINER` RPCs, Realtime, Storage, Auth |
| **Auth** | Supabase Auth: email/password, email confirmation, password reset, email change, cookie-based SSR sessions |
| **Testing** | Vitest, Playwright, pgTAP |
| **Ops** | GitHub Actions CI, Vercel (+ Vercel Cron), Sentry, Resend SMTP, Dependabot |

~17k lines of TypeScript and ~2.5k lines of SQL, all written by hand across six
migrations.

---

## Try it locally

**No backend, no signup — the fastest way to see it:**

```bash
npm install
npm run sandbox    # demo mode: nine fake roommates, in-memory data, user switcher
```

Open [http://localhost:3000](http://localhost:3000). The user switcher in the
header lets you act as any roommate, so you can submit an expense as one person
and approve it as the treasurer.

**With a real backend:**

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the migrations — tables, RLS policies, RPCs, the `receipts` and
   `avatars` storage buckets, and the realtime publication:

   ```bash
   npx supabase link --project-ref <your-project-ref>
   npm run db:push
   ```

3. Copy `.env.example` to `.env.local` and fill in your project URL and anon key
   (**Project Settings → API**).
4. In **Authentication → URL Configuration**, set your site URL and add
   `/reset-password` as a redirect URL so password-reset emails work.
5. `npm run dev` — the app now requires sign-in and persists to Supabase.

---

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Dev server (backend mode if env vars are set) |
| `npm run sandbox` | Dev server in demo mode (fake data, no backend) |
| `npm run build` | Production build |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Browser smoke tests (Playwright) |
| `npm run db:test` | Database authorization tests (pgTAP; needs Docker) |
| `npm run db:push` | Apply pending migrations to the linked project |
| `npm run db:reset` | Rebuild the local database from scratch |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |

Playwright builds and serves the app itself on port 3100; install the browser
once with `npx playwright install chromium`.

---

## Project structure

```
src/
├── app/
│   ├── page.tsx             # Auth gating and which screen is showing
│   ├── layout.tsx           # Root layout + AuthProvider
│   ├── api/reminders/       # Cron-run digest of what's waiting on you
│   ├── reset-password/      # Password reset (from email link)
│   └── error.tsx            # Error boundaries
├── components/
│   ├── AppShell.tsx         # Header, navigation, and the open tab
│   ├── screens/             # Auth, Welcome, CreateGroup, JoinGroup, Profile
│   ├── tabs/                # Dashboard, Rent, Bills, Expenses, Floors,
│   │                        # Chores, Settle, Group
│   ├── dashboard/           # Balance hero, settlement lists, chore board
│   ├── expenses/            # Expense form, row, receipt lightbox
│   ├── periods/             # Monthly close-out and archive
│   └── subgroups/           # One floor's card, members and bills
├── context/AuthProvider.tsx # Supabase session + sign in/up/out/reset
├── hooks/
│   ├── useGroupStore.ts     # Group state, optimistic writes, rollback
│   ├── useGroupRealtime.ts  # Live refetch, deferred while a write is saving
│   └── useAppRoute.ts       # Screen, tab and group id in the URL
├── lib/
│   ├── api.ts               # Supabase reads/writes (diff-based persistence)
│   ├── settlements.ts       # Smart + simple settlement algorithms
│   ├── splits.ts            # Penny-exact even and weighted splits
│   ├── expenseSplits.ts     # Even / subset / exact / percentage split modes
│   ├── charges.ts           # Everything the house currently owes
│   ├── periods.ts           # Monthly close-out, carry-forward, archive
│   ├── members.ts           # Safe member removal and rent re-splitting
│   ├── chores.ts            # Rotation, due dates, calendar projection
│   ├── csv.ts               # Ledger export (formula-injection safe)
│   ├── reminders.ts         # Who is owed a nudge, and what it says
│   └── receipts.ts          # Private storage uploads + signed URLs
├── proxy.ts                 # Session cookie refresh (Next.js 16 Proxy)
e2e/                         # Playwright smoke tests (sandbox mode)
supabase/
├── migrations/              # Tables, RLS, RPCs, storage, realtime
└── tests/                   # pgTAP suites proving the RLS rules hold
```

---

## Deployment

Deployed on [Vercel](https://vercel.com): import the repo and set
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, then add the
production domain to Supabase's auth URL configuration. `vercel.json` schedules
the daily reminder job.

Auth emails go out through [Resend](https://resend.com) SMTP rather than
Supabase's built-in sender, which is capped at roughly two emails an hour and
isn't meant for production — configured under **Authentication → Emails → SMTP
Settings** with no code changes. Optional integrations (Sentry, reminder emails)
are each fully optional: without their environment variables the app runs
normally, and the reminder endpoint returns a 501 naming exactly what's missing.

Migrations are append-only and safe to re-run — to change something, add a new
file rather than editing one that has already run against live data.

---

## License

MIT © Daniel Ranaudo
