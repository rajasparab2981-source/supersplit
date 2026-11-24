# SplitPro

Mobile-first group expense splitter in ₹ INR. Dark Cred-inspired UI with Splitwise's "you owe / you're owed" lens.

Live: https://supersplit.netlify.app (deploys automatically from `main`).

## Run locally

Requires Node.js 20+.

```bash
npm install
npm run dev        # http://localhost:5173 with hot reload
npm test           # unit tests (money, splits, settlements, dates)
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build on http://localhost:4173
```

## Project layout

```
src/
├── main.tsx              Entry: mounts <App/>, registers the service worker
├── App.jsx               Screen routing, sheets, mutations
├── config.ts             Default Supabase project (overridable via VITE_* env vars)
├── types.ts              Row types: Group, Member, Trip, Expense
├── db/db.ts              Data layer: localStorage or Supabase (+ passcode lockdown)
├── lib/
│   ├── money.ts          Integer-paise maths and ₹ formatting
│   ├── splits.ts         Expense shares, balances, settle-up, form validation
│   ├── splits.test.ts    Unit tests
│   ├── dates.ts          Local (IST-safe) calendar dates
│   ├── upi.ts            UPI deep links
│   ├── storage.ts        Device-local prefs ("who am I", saved UPI IDs)
│   ├── image.ts          Photo compression
│   └── constants.ts      Categories, emoji and colour palettes
├── ui/                   Shared building blocks (Sheet, Header, Avatar, icons…)
├── views/                Groups, group, trip, and the trip tabs
└── sheets/               Bottom sheets (add expense, settle via UPI, settings…)
public/                   Manifest, service worker, app icons
supabase/                 SQL scripts
```

Logic lives in strict TypeScript (`src/lib`, `src/db`). Components are still
`.jsx` carried over from the original single-file app; they get typed as they
are rewritten for the new data model in Phase 2–4.

## Money rules

- All maths runs in **integer paise**, so every split adds back to the amount
  exactly and group balances always sum to ₹0.00.
- Equal splits that don't divide evenly give the extra paisa to the first
  people in the split (₹100 ÷ 3 = 33.34 + 33.33 + 33.33).
- Exact splits must match the amount to the paisa; percentage splits are
  converted so the rupee amounts add up exactly.
- Older expenses whose custom shares didn't add up (allowed by the original
  ±₹0.50 tolerance) are treated as the payer absorbing the gap.

## Database v2 (Phase 2, not live yet)

`supabase/migrations/` holds the new schema. It goes live with sign-in
(Phase 3), following [`supabase/SWITCHOVER.md`](supabase/SWITCHOVER.md).

- Members have IDs (placeholders until someone claims them via an invite);
  amounts are integer paise; payers and splits must add up (checked at commit).
- Recorded settlements, activity log, soft delete with restore.
- Row Level Security: you can read only groups you belong to. All writes go
  through database functions (`create_expense`, `record_settlement`,
  `accept_invite`, …) that validate input. Anonymous visitors get nothing.
- Receipts in a private Storage bucket, per-group folders.
- `private.import_legacy()` imports v1 data with identical balance maths.

`npm test` runs the migrations in an in-memory Postgres (PGlite) and checks
the access rules, money rules, invites and import, including your real backup
when `backups/` is present locally.

## Security: group passcode (Phase 0 lockdown)

The shared database is protected by Row Level Security plus a **group passcode**.
The anon key in `src/config.ts` is public by design; without the passcode it
returns no data and cannot write. Each person enters the passcode once per device.

- Set up / lock a database: run [`supabase/legacy/phase0-lockdown.sql`](supabase/legacy/phase0-lockdown.sql) in the Supabase SQL Editor (edit the passcode line first, and never commit the real passcode).
- Change the passcode: `select private.set_passcode('new-passcode');` Everyone is asked again on their next refresh.
- "Reset all data" is disabled in cloud mode.
- Realtime WebSocket events stop under RLS; the 5-second refresh keeps devices in sync.

This is a stopgap until real user accounts (Phase 3).

## Storage keys (device-local)

| Key | Purpose |
|-----|---------|
| `splitpro_data_v1` | Local mode: all groups/members/trips/expenses |
| `splitpro_supabase_v1` | Supabase config `{ url, key }`, or `{ disconnected: true }` |
| `splitpro_passcode_v1` | Group passcode, sent as the `x-splitpro-key` header |
| `splitpro_self_v1` | `{ groupId: memberName }`: who "you" are per group |
| `splitpro_upi_v1` | `{ memberName: upiId }`: saved UPI IDs for Settle Up |

## Features

- Groups (colour + emoji), members, trips, expenses: full create/edit/delete
- 8 expense categories, optional receipt/food photo
- Equal / By % / Exact ₹ splits with live, paise-exact validation
- Per-person "you owe / you're owed" across groups, trips and expenses
- Balances tab (paid vs share), Settle Up with **Pay via UPI** deep links
- Trip recap, emoji reactions, built-in calculator
- Installable (PWA): home-screen icon, app shell opens offline
