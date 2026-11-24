-- ============================================================
-- SplitPro v2: fixes from the Supabase security/performance advisors
-- (run against the staging project on 2026-11-24).
--
-- Intentionally NOT changed: "signed-in users can execute SECURITY DEFINER
-- functions" (21 functions). Those functions ARE the write API; RLS denies all
-- direct writes, and each function checks the caller's membership/role.
-- ============================================================

-- 1. Pin search_path on trigger functions (advisor lint 0011).
alter function private.touch_updated_at() set search_path = '';
alter function private.check_expense_balanced() set search_path = '';

-- 2. Evaluate auth.uid() once per query, not once per row (lint 0003).
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_group_with(id));
create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- 3. Index every foreign key (lint 0001): faster joins, and deleting a user
--    or member no longer scans whole tables.
create index if not exists activity_log_actor_idx        on public.activity_log (actor_id);
create index if not exists expense_reactions_member_idx  on public.expense_reactions (member_id);
create index if not exists expenses_created_by_idx       on public.expenses (created_by);
create index if not exists groups_created_by_idx         on public.groups (created_by);
create index if not exists invites_created_by_idx        on public.invites (created_by);
create index if not exists settlements_created_by_idx    on public.settlements (created_by);
create index if not exists settlements_from_member_idx   on public.settlements (from_member);
create index if not exists settlements_to_member_idx     on public.settlements (to_member);
create index if not exists settlements_trip_idx          on public.settlements (trip_id);
create index if not exists trips_created_by_idx          on public.trips (created_by);
