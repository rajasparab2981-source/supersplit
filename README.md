# SplitPro

Mobile-first group expense splitter in ₹ INR. Dark Cred-inspired UI with Splitwise's "you owe / you're owed" lens.

## Files

```
SplitPro/
├── index.html      The app (single self-contained HTML + JSX inline)
├── config.js       Optional baked-in Supabase credentials (auto-connect on open)
├── db.js           Data layer — localStorage + Supabase router
├── netlify.toml    Netlify deploy config
├── DEPLOY.md       How to deploy
└── README.md
```

## Run locally

Double-click `index.html`, or:

```
start index.html
```

No build step, no server. Works on any modern desktop or mobile browser.

## Modes

### Local only (default)

Data lives in `localStorage` on the device. Nothing leaves the browser.

### Supabase real-time sync (cross-device)

Tap **Gear icon → Supabase sync** and paste your Project URL + anon public key. Once connected:

- Atomic INSERT / DELETE — no race conditions
- WebSocket real-time push between connected devices
- 5-second polling fallback
- A green "live" dot appears next to the gear icon

### Zero-friction sharing (recommended for groups)

Edit `config.js` and paste your Supabase URL + anon key. When deployed, anyone opening the URL gets auto-connected on first paint — no gear icon, no copy-paste. See **`DEPLOY.md`**.

## Supabase setup (one-time)

1. Go to [supabase.com](https://supabase.com) → sign up free → **New Project**
2. Open **SQL Editor** → paste this → **Run**:

```sql
create table if not exists groups (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  emoji text not null default '👥',
  color text not null default '#0D9488',
  created_at timestamptz default now()
);

create table if not exists members (
  id uuid default gen_random_uuid() primary key,
  group_id uuid references groups(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

create table if not exists trips (
  id uuid default gen_random_uuid() primary key,
  group_id uuid references groups(id) on delete cascade,
  name text not null,
  emoji text not null default '🏖️',
  created_at timestamptz default now()
);

create table if not exists expenses (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references trips(id) on delete cascade,
  description text not null,
  amount numeric(12,2) not null,
  paid_by text not null,
  split_among text[] not null default '{}',
  category text not null default 'other',
  expense_date date not null,
  shares jsonb,
  created_at timestamptz default now()
);

alter table groups   disable row level security;
alter table members  disable row level security;
alter table trips    disable row level security;
alter table expenses disable row level security;
```

3. **Database → Publications** → click `supabase_realtime` → toggle ON: `groups`, `members`, `trips`, `expenses`
4. **Project Settings → API Keys** → copy **Project URL** + **anon public** key
5. Paste into the app (gear → Supabase sync) **or** into `config.js` for auto-connect

> Already have an older database without the `shares` column? Run this one line to add it: `alter table expenses add column if not exists shares jsonb;`

## Features

- Groups (color + emoji), members, trips, expenses — full CRUD
- 8 expense categories
- **Equal / By % / Exact ₹** split modes with live validation
- **Edit any expense** by tapping it (sheet opens pre-filled)
- **"Who are you?"** picker per group for personalized "you owe / you're owed"
- **Overall balance hero** summing across all groups
- **Per-expense "you" line** showing each expense's impact on your balance
- **Balances tab** — net per member, green/red coding
- **Settle Up tab** — greedy min-transfer + **Pay via UPI** button that opens GPay/PhonePe/Paytm with amount pre-filled
- INR (₹) en-IN locale formatting throughout
- Mobile-first, max-width 480px, bottom-sheet modals
- Live sync indicator when Supabase is connected
- Auto-navigate back if a referenced group/trip is deleted elsewhere
- Reset-all-data control in Settings (against the active backend)

## Storage keys

| Key | Purpose |
|-----|---------|
| `splitpro_data_v1` | Local mode: all groups/members/trips/expenses |
| `splitpro_supabase_v1` | Supabase config `{ url, key }` if connected, or `{ disconnected: true }` |
| `splitpro_self_v1` | `{ groupId: memberName }` — who "you" are per group |
| `splitpro_upi_v1` | `{ memberName: upiId }` — cached UPI IDs for Settle Up's Pay button |

All four are device-local — they don't sync via Supabase.

## Notes

- Babel standalone transpiles JSX in the browser on every load. Fine for personal use; for production scale, pre-compile.
- `paid_by` is plain text and `split_among` is a string array — same shape as Supabase — so renaming or removing a member never breaks past expense history.
- `shares` is a `jsonb` column on `expenses`. Null = equal split (the default). When set, it maps `{ memberName: rupeeAmount }` for unequal splits.
- RLS is disabled. This is the "trusted friend group" model from the original handoff doc — anyone with the anon key has full access. For a public app you'd want auth + RLS policies.
