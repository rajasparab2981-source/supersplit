-- ============================================================
-- SplitPro v2: core schema
--
-- Key differences from the v1 tables:
--   * Money is stored as integer minor units (paise), never floats.
--   * Members are rows with IDs. Expenses reference member IDs, not names,
--     so renames never break history. A member may be a placeholder (no
--     user account yet) and be claimed later via an invite.
--   * Who paid and who owes live in expense_payers / expense_splits, and a
--     deferred check guarantees both always add up to the expense amount.
--   * Settlements (who paid whom back) are recorded, not just suggested.
--   * Soft delete (deleted_at) everywhere users can delete, so undo and the
--     activity log keep working.
-- ============================================================

create schema if not exists private;
revoke all on schema private from public;

-- ---------- Types ----------
create type public.member_role as enum ('owner', 'admin', 'member');
create type public.split_mode as enum ('equal', 'percentage', 'exact');
create type public.settlement_method as enum ('upi', 'cash', 'bank', 'other');

-- ---------- Helpers ----------
create or replace function private.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------- Profiles (one per signed-in user) ----------
create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  display_name     text not null check (char_length(btrim(display_name)) between 1 and 60),
  avatar_url       text,
  upi_id           text check (upi_id is null or upi_id ~ '^[A-Za-z0-9._-]{2,}@[A-Za-z0-9._-]{2,}$'),
  default_currency char(3) not null default 'INR' check (default_currency ~ '^[A-Z]{3}$'),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

-- ---------- Groups ----------
create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  emoji       text not null default '👥' check (char_length(emoji) <= 16),
  color       text not null default '#00E5A0' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  currency    char(3) not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create trigger groups_touch before update on public.groups
  for each row execute function private.touch_updated_at();

-- ---------- Group members ----------
create table public.group_members (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.groups (id) on delete cascade,
  user_id       uuid references auth.users (id) on delete set null, -- null = placeholder
  display_name  text not null check (char_length(btrim(display_name)) between 1 and 60),
  role          public.member_role not null default 'member',
  created_at    timestamptz not null default now(),
  left_at       timestamptz,                                         -- removed / left; history kept
  unique (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id) where left_at is null;
-- No two active members with the same name in a group.
create unique index group_members_active_name_uidx
  on public.group_members (group_id, lower(btrim(display_name))) where left_at is null;

-- ---------- Trips (optional grouping of expenses inside a group) ----------
create table public.trips (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  emoji       text not null default '🏖️' check (char_length(emoji) <= 16),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index trips_group_idx on public.trips (group_id);

-- ---------- Expenses ----------
create table public.expenses (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.groups (id) on delete cascade,
  trip_id       uuid references public.trips (id) on delete set null,
  description   text not null check (char_length(btrim(description)) between 1 and 120),
  amount_minor  bigint not null check (amount_minor > 0 and amount_minor <= 100000000000),
  currency      char(3) not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  category      text not null default 'other'
                check (category in ('food', 'travel', 'stay', 'drinks', 'fun', 'shopping', 'fuel', 'other')),
  expense_date  date not null,
  split_mode    public.split_mode not null default 'equal',
  receipt_path  text,                       -- object path in the private `receipts` bucket
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  version       integer not null default 1  -- optimistic concurrency for edits
);
create index expenses_group_idx on public.expenses (group_id, expense_date desc) where deleted_at is null;
create index expenses_trip_idx on public.expenses (trip_id) where deleted_at is null;
create trigger expenses_touch before update on public.expenses
  for each row execute function private.touch_updated_at();

create table public.expense_payers (
  expense_id    uuid not null references public.expenses (id) on delete cascade,
  member_id     uuid not null references public.group_members (id),
  amount_minor  bigint not null check (amount_minor > 0),
  primary key (expense_id, member_id)
);
create index expense_payers_member_idx on public.expense_payers (member_id);

create table public.expense_splits (
  expense_id    uuid not null references public.expenses (id) on delete cascade,
  member_id     uuid not null references public.group_members (id),
  amount_minor  bigint not null check (amount_minor >= 0),
  primary key (expense_id, member_id)
);
create index expense_splits_member_idx on public.expense_splits (member_id);

create table public.expense_reactions (
  expense_id  uuid not null references public.expenses (id) on delete cascade,
  member_id   uuid not null references public.group_members (id) on delete cascade,
  emoji       text not null check (char_length(emoji) between 1 and 16),
  created_at  timestamptz not null default now(),
  primary key (expense_id, member_id)
);

-- Payers and splits must each add up exactly to the expense amount. Checked
-- at COMMIT (deferred), so a function can insert the expense and its rows in
-- any order within one transaction.
create or replace function private.check_expense_balanced() returns trigger
language plpgsql as $$
declare
  eid uuid;
  amt bigint;
  paid bigint;
  owed bigint;
begin
  -- Row shapes differ: expenses has `id`, the child tables have `expense_id`.
  if tg_table_name = 'expenses' then
    eid := (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'id';
  else
    eid := (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'expense_id';
  end if;
  select amount_minor into amt from public.expenses where id = eid;
  if amt is null then return null; end if; -- expense deleted in same transaction
  select coalesce(sum(amount_minor), 0) into paid from public.expense_payers where expense_id = eid;
  select coalesce(sum(amount_minor), 0) into owed from public.expense_splits where expense_id = eid;
  if paid <> amt or owed <> amt then
    raise exception 'Expense % does not balance: amount %, paid %, split %', eid, amt, paid, owed
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create constraint trigger expenses_balanced
  after insert or update of amount_minor on public.expenses
  deferrable initially deferred for each row execute function private.check_expense_balanced();
create constraint trigger expense_payers_balanced
  after insert or update or delete on public.expense_payers
  deferrable initially deferred for each row execute function private.check_expense_balanced();
create constraint trigger expense_splits_balanced
  after insert or update or delete on public.expense_splits
  deferrable initially deferred for each row execute function private.check_expense_balanced();

-- ---------- Settlements (recorded repayments) ----------
create table public.settlements (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.groups (id) on delete cascade,
  trip_id       uuid references public.trips (id) on delete set null, -- settled from a trip's view
  from_member   uuid not null references public.group_members (id),
  to_member     uuid not null references public.group_members (id),
  amount_minor  bigint not null check (amount_minor > 0 and amount_minor <= 100000000000),
  currency      char(3) not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  method        public.settlement_method not null default 'upi',
  note          text check (note is null or char_length(note) <= 200),
  settled_on    date not null default current_date,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  check (from_member <> to_member)
);
create index settlements_group_idx on public.settlements (group_id) where deleted_at is null;

-- ---------- Invites ----------
create table public.invites (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups (id) on delete cascade,
  token_hash  text not null unique,        -- sha256 of the token; the token itself is never stored
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  max_uses    integer not null default 20 check (max_uses between 1 and 500),
  uses        integer not null default 0,
  revoked_at  timestamptz
);
create index invites_group_idx on public.invites (group_id);

-- ---------- Activity log ----------
create table public.activity_log (
  id          bigint generated always as identity primary key,
  group_id    uuid not null references public.groups (id) on delete cascade,
  actor_id    uuid references auth.users (id) on delete set null,
  action      text not null,               -- e.g. expense.created, settlement.deleted
  entity_id   uuid,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index activity_log_group_idx on public.activity_log (group_id, created_at desc);
