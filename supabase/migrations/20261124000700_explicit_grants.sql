-- ============================================================
-- SplitPro v2: explicit table privileges
--
-- Newer Supabase projects do not grant table access to `anon` /
-- `authenticated` automatically. Found on staging: signed-in users got
-- "permission denied for table group_members". Grant exactly what the
-- RLS model needs; RLS still decides which ROWS each user sees.
-- ============================================================

-- Signed-in users may READ group data (filtered by RLS) ...
grant select on public.groups, public.group_members, public.trips, public.expenses,
  public.expense_payers, public.expense_splits, public.expense_reactions,
  public.settlements, public.invites, public.activity_log
  to authenticated;

-- ... and read/create/update their own profile (RLS limits it to their row).
grant select, insert, update on public.profiles to authenticated;

-- Signed-out visitors get nothing.
revoke all on public.groups, public.group_members, public.trips, public.expenses,
  public.expense_payers, public.expense_splits, public.expense_reactions,
  public.settlements, public.invites, public.activity_log, public.profiles
  from anon;
