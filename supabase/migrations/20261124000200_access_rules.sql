-- ============================================================
-- SplitPro v2: access rules (Row Level Security)
--
-- Model: a signed-in user can READ everything in groups they are an active
-- member of, and nothing else. ALL WRITES go through the security-definer
-- functions in the next migration, which validate input (sums, membership,
-- roles) before changing anything. The only direct write allowed is a user
-- editing their own profile.
--
-- The anonymous role gets no access to any table.
-- ============================================================

-- ---------- Membership helpers (bypass RLS internally, so no recursion) ----------
create or replace function private.is_group_member(p_group_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = p_group_id and m.user_id = auth.uid() and m.left_at is null
  );
$$;

create or replace function private.group_role(p_group_id uuid) returns public.member_role
language sql stable security definer set search_path = '' as $$
  select m.role from public.group_members m
  where m.group_id = p_group_id and m.user_id = auth.uid() and m.left_at is null;
$$;

create or replace function private.my_member_id(p_group_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.id from public.group_members m
  where m.group_id = p_group_id and m.user_id = auth.uid() and m.left_at is null;
$$;

create or replace function private.shares_group_with(p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.group_members a
    join public.group_members b on b.group_id = a.group_id
    where a.user_id = auth.uid() and a.left_at is null
      and b.user_id = p_user_id and b.left_at is null
  );
$$;

revoke all on function private.is_group_member(uuid), private.group_role(uuid),
  private.my_member_id(uuid), private.shares_group_with(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_group_member(uuid), private.group_role(uuid),
  private.my_member_id(uuid), private.shares_group_with(uuid) to authenticated;

-- ---------- Turn on RLS everywhere ----------
alter table public.profiles          enable row level security;
alter table public.groups            enable row level security;
alter table public.group_members     enable row level security;
alter table public.trips             enable row level security;
alter table public.expenses          enable row level security;
alter table public.expense_payers    enable row level security;
alter table public.expense_splits    enable row level security;
alter table public.expense_reactions enable row level security;
alter table public.settlements       enable row level security;
alter table public.invites           enable row level security;
alter table public.activity_log      enable row level security;

-- Defense in depth: even with RLS on, take direct write privileges away.
revoke all on public.profiles, public.groups, public.group_members, public.trips,
  public.expenses, public.expense_payers, public.expense_splits, public.expense_reactions,
  public.settlements, public.invites, public.activity_log from anon;
revoke insert, update, delete, truncate on public.groups, public.group_members, public.trips,
  public.expenses, public.expense_payers, public.expense_splits, public.expense_reactions,
  public.settlements, public.invites, public.activity_log from authenticated;
revoke delete, truncate on public.profiles from authenticated;

-- ---------- Profiles ----------
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or private.shares_group_with(id));
create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ---------- Group data: members read, nobody writes directly ----------
create policy groups_select on public.groups for select to authenticated
  using (deleted_at is null and private.is_group_member(id));

create policy group_members_select on public.group_members for select to authenticated
  using (private.is_group_member(group_id));

create policy trips_select on public.trips for select to authenticated
  using (private.is_group_member(group_id));

create policy expenses_select on public.expenses for select to authenticated
  using (private.is_group_member(group_id));

create policy expense_payers_select on public.expense_payers for select to authenticated
  using (exists (select 1 from public.expenses e where e.id = expense_id and private.is_group_member(e.group_id)));

create policy expense_splits_select on public.expense_splits for select to authenticated
  using (exists (select 1 from public.expenses e where e.id = expense_id and private.is_group_member(e.group_id)));

create policy expense_reactions_select on public.expense_reactions for select to authenticated
  using (exists (select 1 from public.expenses e where e.id = expense_id and private.is_group_member(e.group_id)));

create policy settlements_select on public.settlements for select to authenticated
  using (private.is_group_member(group_id));

create policy activity_log_select on public.activity_log for select to authenticated
  using (private.is_group_member(group_id));

-- Invite rows (hashes, usage) are visible to group admins only.
create policy invites_select on public.invites for select to authenticated
  using (private.group_role(group_id) in ('owner', 'admin'));
