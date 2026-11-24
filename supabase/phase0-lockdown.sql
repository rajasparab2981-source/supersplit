-- ============================================================
-- SplitPro — Phase 0 emergency lockdown
--
-- WHAT THIS DOES
--   Turns on Row Level Security for groups, members, trips and
--   expenses. After this runs, the public anon key in config.js is
--   no longer enough: every request must also send the group
--   passcode (header `x-splitpro-key`). The app asks each person for
--   the passcode once and remembers it on their device.
--
--   This is a STOPGAP until real user accounts land in Phase 3.
--   It stops strangers who read config.js; it does not give each
--   friend their own permissions.
--
-- HOW TO RUN
--   1. Deploy the updated app to Netlify FIRST (it keeps working
--      against the open database, so order is safe).
--   2. Change the passcode on the line marked >>> below.
--   3. Supabase dashboard → SQL Editor → New query → paste → Run.
--   4. Share the passcode with your group privately (not in a
--      public chat, not in the repo).
--
-- TO CHANGE THE PASSCODE LATER, run only:
--   select private.set_passcode('your-new-passcode');
--   Everyone will be asked for the new one on their next refresh.
--
-- NOTE: live WebSocket updates stop after this (Realtime can't see
-- the passcode header). The app's 5-second refresh keeps devices in
-- sync, so changes appear within ~5 s instead of instantly.
-- ============================================================

begin;

create extension if not exists pgcrypto with schema extensions;

-- Private schema: not exposed through the REST API.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create table if not exists private.app_secret (
  id              int primary key default 1 check (id = 1),
  passcode_sha256 text not null,
  updated_at      timestamptz not null default now()
);
revoke all on private.app_secret from public, anon, authenticated;

-- Admin-only: set or rotate the passcode.
create or replace function private.set_passcode(p text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p is null or length(p) < 8 or p = 'CHANGE-ME-TO-A-LONG-PASSCODE' then
    raise exception 'Pick a real passcode of at least 8 characters';
  end if;
  insert into private.app_secret (id, passcode_sha256)
  values (1, encode(extensions.digest(p, 'sha256'), 'hex'))
  on conflict (id) do update
    set passcode_sha256 = excluded.passcode_sha256,
        updated_at      = now();
end;
$$;
revoke all on function private.set_passcode(text) from public, anon, authenticated;

-- True when the request carries the correct passcode header.
create or replace function private.has_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.app_secret s
    where s.passcode_sha256 = encode(
      extensions.digest(
        coalesce(
          nullif(current_setting('request.headers', true), '')::json ->> 'x-splitpro-key',
          ''
        ),
        'sha256'
      ),
      'hex'
    )
  );
$$;
revoke all on function private.has_access() from public;
grant execute on function private.has_access() to anon, authenticated;

-- Public RPC the app calls to check a passcode before loading data.
create or replace function public.splitpro_check_access()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.has_access();
$$;
revoke all on function public.splitpro_check_access() from public;
grant execute on function public.splitpro_check_access() to anon, authenticated;

-- >>> CHANGE THIS before running (min 8 characters, avoid obvious words):
select private.set_passcode('CHANGE-ME-TO-A-LONG-PASSCODE');

-- Lock the four tables: only passcode holders can read or write.
do $$
declare t text;
begin
  foreach t in array array['groups', 'members', 'trips', 'expenses'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists splitpro_passcode_access on public.%I', t);
    execute format(
      'create policy splitpro_passcode_access on public.%I
         for all to anon, authenticated
         using ((select private.has_access()))
         with check ((select private.has_access()))',
      t
    );
  end loop;
end;
$$;

commit;

-- ------------------------------------------------------------
-- VERIFY (optional): should return the 4 tables with rls = true
--   select relname, relrowsecurity as rls
--   from pg_class
--   where relname in ('groups','members','trips','expenses');
--
-- ROLLBACK (only if something goes badly wrong — reopens the DB):
--   alter table public.groups   disable row level security;
--   alter table public.members  disable row level security;
--   alter table public.trips    disable row level security;
--   alter table public.expenses disable row level security;
-- ------------------------------------------------------------
