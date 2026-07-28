# DivvyUp — Payment Planning for Roommates

Split rent, utilities, and shared expenses with your roommates. Includes smart
settlements (minimize the number of payments), expense approval workflows,
chore rotations, and sub-groups ("floors") with their own shared bills —
backed by Supabase with realtime sync between roommates.

## Quick Start (no backend)

```bash
npm install
npm run dev        # local demo mode: no auth, in-memory data
npm run sandbox    # demo mode with fake roommates + user switcher
```

Open [http://localhost:3000](http://localhost:3000).

## Full Setup (Supabase backend)

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the database migrations (see [Database](#database) below):

   ```bash
   npx supabase link --project-ref <your-project-ref>
   npm run db:push
   ```

   This creates the tables, row-level security policies, RPCs, the `receipts`
   and `avatars` storage buckets, and the realtime publication.
3. Copy `.env.example` to `.env.local` and fill in your project's URL and
   anon key (**Project Settings → API**).
4. In **Authentication → URL Configuration**, set your site URL and add
   `/reset-password` as a redirect URL so password-reset emails work.
5. `npm run dev` — the app now requires sign-in and persists to Supabase.

## Database

The schema lives in `supabase/migrations/` as numbered files, applied in
filename order by the [Supabase CLI](https://supabase.com/docs/guides/cli).

| Command | Purpose |
|---------|---------|
| `npm run db:push` | Apply pending migrations to the linked project |
| `npm run db:reset` | Rebuild the local database from scratch |
| `npm run db:diff -- -f <name>` | Generate a migration from local changes |
| `npm run db:test` | Run the pgTAP suites against the local database |

Every migration is written to be safe to re-run, so applying them to a project
that is already up to date is a no-op. If you'd rather not install the CLI, you
can paste each file into **SQL Editor → New query** in filename order.

Migrations are append-only: to change something, add a new file rather than
editing an old one, since earlier files have already run against live data.

### Upgrading an existing project

The migrations after the baseline close security holes that were exploitable by
any group member — self-promotion to treasurer, inserting pre-approved
expenses, and editing the amount of a payment while confirming it. Apply them
before letting anyone else use your instance. They also make the `receipts`
bucket private; receipts uploaded while it was public keep working, because the
app falls back to the stored URL when a row doesn't hold a storage path.

## Production Email (Resend SMTP)

Supabase's built-in email sender is limited to ~2 emails/hour and is not meant
for production. Auth emails (signup confirmation, password reset) should be
delivered through [Resend](https://resend.com) instead. No code changes are
needed — Supabase generates the emails and Resend delivers them:

1. Create a Resend account and verify a domain you own
   (**Domains → Add Domain**, then add the SPF/DKIM DNS records it shows).
   Without a verified domain, Resend only delivers to your own address.
2. Create an API key (**API Keys → Create**, sending access is enough).
3. In Supabase: **Authentication → Emails → SMTP Settings**, enable
   **Custom SMTP** with:
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: your `re_...` API key
   - Sender: `no-reply@yourdomain.com` + a sender name
4. Review **Authentication → Rate Limits** (email defaults to 30/hour once
   custom SMTP is on) and optionally restyle the templates under
   **Authentication → Emails → Templates**.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Dev server (backend mode if env vars set) |
| `npm run sandbox` | Dev server in sandbox mode (fake data, no backend) |
| `npm run build` | Production build |
| `npm test` | Run unit tests (Vitest) |
| `npm run test:watch` | Tests in watch mode |
| `npm run test:e2e` | Run the browser smoke tests (Playwright) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |

CI (GitHub Actions) runs lint, typecheck, tests, and build on every push and PR.

## Testing

Three layers, because the risks are in three different places.

**Unit tests** (`npm test`) cover the money logic in `src/lib/` — splits,
settlements, chore rotations, member removal — and `persistGroupDiff`, which is
tested against a fake Supabase client that records the calls it receives.

**Browser smoke tests** (`npm run test:e2e`) drive the real UI through the path
a household actually walks: front an expense, approve it, settle the debt,
confirm the payment. They run against a sandbox-mode build, so no Supabase
project, test accounts, or cleanup are involved. Playwright builds and serves
the app itself on port 3100; install the browser once with
`npx playwright install chromium`.

**Database tests** (`npm run db:test`) are the important ones. Authorization
lives entirely in Postgres, because the browser talks to Supabase directly — so
`supabase/tests/` asserts, as an ordinary group member, that you cannot promote
yourself to treasurer, insert an already-approved expense, choose your own
splits, edit the amount of a payment while confirming it, or overwrite a
roommate's simultaneous edit. Every one of those attacks worked before the
migrations that follow the baseline. Needs Docker and a `supabase start`.

## Project Structure

```
src/
├── app/
│   ├── page.tsx             # Auth gating and which screen is showing
│   ├── layout.tsx           # Root layout + AuthProvider
│   ├── error.tsx            # Error boundary
│   ├── global-error.tsx     # Root-layout error fallback
│   └── reset-password/      # Password reset (from email link)
├── components/
│   ├── AppShell.tsx         # Header, navigation, and the open tab
│   ├── screens/             # Auth, Welcome, CreateGroup, JoinGroup, Profile
│   ├── tabs/                # Dashboard, Rent, Bills, Expenses, Floors,
│   │                        # Chores, Settle, Group
│   ├── dashboard/           # Balance hero, settlement lists, chore board
│   ├── chores/              # Chore form and board rows
│   ├── expenses/            # Expense form, row, receipt lightbox
│   ├── profile/             # Profile card and group list
│   └── subgroups/           # One floor's card, members and bills
├── context/
│   └── AuthProvider.tsx     # Supabase session + sign in/up/out/reset
├── hooks/
│   ├── useGroupStore.ts     # Group state, optimistic writes, rollback
│   ├── useGroupRealtime.ts  # Live refetch, deferred while a write is saving
│   └── useAppRoute.ts       # Screen, tab and group id in the URL
├── lib/
│   ├── api.ts               # Supabase reads/writes (diff-based persistence)
│   ├── settlements.ts       # Smart + simple settlement algorithms
│   ├── splits.ts            # Penny-exact even splits
│   ├── charges.ts           # Everything the house currently owes
│   ├── expenses.ts          # Submitting, approving and reopening expenses
│   ├── roster.ts            # Member lookups shared across the UI
│   ├── periods.ts           # Monthly close-out, carry-forward, archive
│   ├── csv.ts               # Ledger export (formula-injection safe)
│   ├── reminders.ts         # Who is owed a nudge, and what it says
│   ├── payments.ts          # Confirming and denying payments
│   ├── expenseSplits.ts     # Even / subset / exact / percentage splits
│   ├── chores.ts            # Chore rotation + due-date logic
│   ├── receipts.ts          # Receipt uploads to Supabase Storage
│   ├── avatars.ts           # Profile picture uploads to Supabase Storage
│   ├── profile.ts           # Venmo/Zelle formatting + validation
│   ├── image.ts             # Client-side image compression
│   ├── tokens.ts            # Design tokens (colors, fonts, shared styles)
│   ├── types.ts             # Domain model
│   └── supabase/            # Browser + server Supabase clients
│   └── api/reminders/       # Cron-run digest of what's waiting on you
├── proxy.ts                 # Session cookie refresh (Next.js 16 Proxy)
e2e/                         # Playwright smoke tests (sandbox mode)
supabase/
├── migrations/              # Tables, RLS, RPCs, storage, realtime
└── tests/                   # pgTAP suites proving the RLS rules hold
```

## Tech Stack

- **Next.js 16** (App Router, Turbopack)
- **React 19** + **TypeScript**
- **Supabase** — auth, Postgres with row-level security, realtime, storage
- **Vitest** — unit tests for settlement/split/chore logic
- **Playwright** — browser smoke tests
- **pgTAP** — tests for the row-level security rules

## How It Works

- All group state lives in React; every change is diffed and persisted to
  Supabase (`persistGroupDiff` in `src/lib/api.ts`). Failed writes surface a
  toast and roll back to server state.
- Row-level security enforces that members only see their groups; rent and
  bills are treasurer-only, expenses need treasurer approval, and payments
  are confirmed by the recipient.
- Realtime subscriptions refetch the active group when any roommate changes
  something, so everyone stays in sync.
- Closing a month (Settle tab, treasurer only) archives that month's one-off
  expenses, payments and bills, and records whatever is still owed as a
  carry-forward — a short list of "A owes B" that keeps counting on its own.
  Rent and recurring bills charge again in the new month. Archived rows are no
  longer loaded with the group; the Past Months list fetches them a page at a
  time.
- Any month, open or archived, exports to a single CSV of expenses and
  payments. Fields that a spreadsheet would run as a formula are quoted.
- `GET /api/reminders` emails each person one summary of the expenses waiting
  on their approval and the payments waiting on their confirmation, skipping
  anything less than a day old. `vercel.json` runs it daily; it needs
  `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `REMINDER_FROM` and
  `CRON_SECRET`, and does nothing (501, naming what's missing) without them.
- Receipts are compressed client-side and uploaded to the `receipts` storage
  bucket, keyed by group.
- Profile pictures are compressed client-side and uploaded to the `avatars`
  bucket under the user's own folder. Contact details (Venmo, Zelle, picture)
  live on `profiles` and are mirrored onto every `group_members` row, so
  editing them in the profile updates each group at once.

## Deploy

Deploy on [Vercel](https://vercel.com): import the repo and set
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the project
environment variables. Remember to add your production domain to Supabase's
auth URL configuration.
