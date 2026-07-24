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
2. Open **SQL Editor → New query**, paste the entire contents of
   `supabase/schema.sql`, and run it. This creates all tables, row-level
   security policies, RPCs, the receipts storage bucket, and realtime
   publications. The script is idempotent — re-run it after pulling schema
   changes.
3. Copy `.env.example` to `.env.local` and fill in your project's URL and
   anon key (**Project Settings → API**).
4. In **Authentication → URL Configuration**, set your site URL and add
   `/reset-password` as a redirect URL so password-reset emails work.
5. `npm run dev` — the app now requires sign-in and persists to Supabase.

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
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |

CI (GitHub Actions) runs lint, typecheck, tests, and build on every push and PR.

## Project Structure

```
src/
├── app/
│   ├── page.tsx             # Main app: auth gating, group state, tabs, realtime
│   ├── layout.tsx           # Root layout + AuthProvider
│   ├── error.tsx            # Error boundary
│   ├── global-error.tsx     # Root-layout error fallback
│   └── reset-password/      # Password reset (from email link)
├── components/
│   ├── screens/             # Auth, Welcome, CreateGroup, JoinGroup
│   └── tabs/                # Dashboard, Rent, Bills, Expenses, Floors,
│                            # Chores, Settle, Group
├── context/
│   └── AuthProvider.tsx     # Supabase session + sign in/up/out/reset
├── lib/
│   ├── api.ts               # Supabase reads/writes (diff-based persistence)
│   ├── settlements.ts       # Smart + simple settlement algorithms
│   ├── splits.ts            # Penny-exact even splits
│   ├── charges.ts           # Subgroup bill flattening
│   ├── chores.ts            # Chore rotation + due-date logic
│   ├── receipts.ts          # Receipt uploads to Supabase Storage
│   ├── image.ts             # Client-side image compression
│   ├── tokens.ts            # Design tokens (colors, fonts, shared styles)
│   ├── types.ts             # Domain model
│   └── supabase/            # Browser + server Supabase clients
├── proxy.ts                 # Session cookie refresh (Next.js 16 Proxy)
supabase/
└── schema.sql               # Tables, RLS, RPCs, storage, realtime — run in
                             # the Supabase SQL Editor
```

## Tech Stack

- **Next.js 16** (App Router, Turbopack)
- **React 19** + **TypeScript**
- **Supabase** — auth, Postgres with row-level security, realtime, storage
- **Vitest** — unit tests for settlement/split/chore logic

## How It Works

- All group state lives in React; every change is diffed and persisted to
  Supabase (`persistGroupDiff` in `src/lib/api.ts`). Failed writes surface a
  toast and roll back to server state.
- Row-level security enforces that members only see their groups; rent and
  bills are treasurer-only, expenses need treasurer approval, and payments
  are confirmed by the recipient.
- Realtime subscriptions refetch the active group when any roommate changes
  something, so everyone stays in sync.
- Receipts are compressed client-side and uploaded to the `receipts` storage
  bucket, keyed by group.

## Deploy

Deploy on [Vercel](https://vercel.com): import the repo and set
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the project
environment variables. Remember to add your production domain to Supabase's
auth URL configuration.
