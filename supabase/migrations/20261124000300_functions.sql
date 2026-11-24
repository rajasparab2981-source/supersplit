-- ============================================================
-- SplitPro v2: write API (database functions)
--
-- Every change to group data goes through these functions. Each one:
--   * requires a signed-in user (auth.uid()),
--   * checks the caller is an active member (and the right role where needed),
--   * validates input (amounts add up, members belong to the group),
--   * is idempotent where the app may retry (client-supplied UUIDs).
-- They run as the table owner (security definer) with an empty search_path,
-- so every name is fully qualified.
--
-- Errors use SQLSTATE codes the app can rely on:
--   42501 not allowed  |  22023 invalid input  |  P0002 not found
--   40001 version conflict (someone else edited first)
-- ============================================================

-- ---------- Guards ----------
create or replace function private.require_user() returns uuid
language plpgsql stable set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  return uid;
end;
$$;

create or replace function private.require_member(p_group_id uuid) returns uuid
language plpgsql stable set search_path = '' as $$
declare mid uuid;
begin
  perform private.require_user();
  select m.id into mid from public.group_members m
  join public.groups g on g.id = m.group_id and g.deleted_at is null
  where m.group_id = p_group_id and m.user_id = auth.uid() and m.left_at is null;
  if mid is null then raise exception 'You are not a member of this group' using errcode = '42501'; end if;
  return mid;
end;
$$;

create or replace function private.require_role(p_group_id uuid, p_roles public.member_role[]) returns uuid
language plpgsql stable set search_path = '' as $$
declare mid uuid; r public.member_role;
begin
  mid := private.require_member(p_group_id);
  select role into r from public.group_members where id = mid;
  if not (r = any (p_roles)) then
    raise exception 'Only a group % can do this', array_to_string(p_roles, ' or ') using errcode = '42501';
  end if;
  return mid;
end;
$$;

create or replace function private.clean_text(p text, p_label text, p_max int) returns text
language plpgsql immutable set search_path = '' as $$
declare t text := btrim(coalesce(p, ''));
begin
  if t = '' then raise exception '% is required', p_label using errcode = '22023'; end if;
  if char_length(t) > p_max then raise exception '% is too long (max % characters)', p_label, p_max using errcode = '22023'; end if;
  return t;
end;
$$;

-- Validate a payers/splits list: [{member_id, amount_minor}, ...]
create or replace function private.validate_shares(
  p_group_id uuid, p_rows jsonb, p_amount bigint, p_label text, p_allow_zero boolean
) returns void
language plpgsql stable set search_path = '' as $$
declare total bigint; dup int; bad int;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception '% must list at least one person', p_label using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_rows) as x(member_id uuid, amount_minor bigint)
    where x.member_id is null or x.amount_minor is null
       or x.amount_minor < (case when p_allow_zero then 0 else 1 end)
  ) then
    raise exception '% has a missing person or an invalid amount', p_label using errcode = '22023';
  end if;
  select coalesce(sum(x.amount_minor), 0), count(*) - count(distinct x.member_id)
    into total, dup
  from jsonb_to_recordset(p_rows) as x(member_id uuid, amount_minor bigint);
  if dup > 0 then raise exception '% lists the same person twice', p_label using errcode = '22023'; end if;
  select count(*) into bad
  from jsonb_to_recordset(p_rows) as x(member_id uuid, amount_minor bigint)
  where not exists (select 1 from public.group_members m where m.id = x.member_id and m.group_id = p_group_id);
  if bad > 0 then raise exception '% includes someone who is not in this group', p_label using errcode = '22023'; end if;
  if total <> p_amount then
    raise exception '% add up to % but the expense is % (minor units)', p_label, total, p_amount using errcode = '22023';
  end if;
end;
$$;

create or replace function private.write_expense_rows(p_expense_id uuid, p_payers jsonb, p_splits jsonb) returns void
language plpgsql set search_path = '' as $$
begin
  delete from public.expense_payers where expense_id = p_expense_id;
  delete from public.expense_splits where expense_id = p_expense_id;
  insert into public.expense_payers (expense_id, member_id, amount_minor)
    select p_expense_id, x.member_id, x.amount_minor from jsonb_to_recordset(p_payers) as x(member_id uuid, amount_minor bigint);
  insert into public.expense_splits (expense_id, member_id, amount_minor)
    select p_expense_id, x.member_id, x.amount_minor from jsonb_to_recordset(p_splits) as x(member_id uuid, amount_minor bigint);
end;
$$;

-- ============================================================
-- Profiles: created automatically when someone signs up
-- ============================================================
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare name text;
begin
  name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'SplitPro user'
  );
  insert into public.profiles (id, display_name) values (new.id, left(name, 60))
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ============================================================
-- Groups
-- ============================================================
create or replace function public.create_group(
  p_name text, p_emoji text default null, p_color text default null,
  p_currency text default 'INR', p_display_name text default null, p_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_user(); gid uuid := coalesce(p_id, gen_random_uuid()); me text;
begin
  if exists (select 1 from public.groups where id = gid) then
    perform private.require_member(gid); -- retry of a create the caller already owns
    return gid;
  end if;
  me := coalesce(nullif(btrim(p_display_name), ''), (select display_name from public.profiles where id = uid), 'Me');
  insert into public.groups (id, name, emoji, color, currency, created_by)
  values (gid, private.clean_text(p_name, 'Group name', 60), coalesce(p_emoji, '👥'),
          coalesce(p_color, '#00E5A0'), upper(coalesce(p_currency, 'INR')), uid);
  insert into public.group_members (group_id, user_id, display_name, role)
  values (gid, uid, left(me, 60), 'owner');
  return gid;
end;
$$;

create or replace function public.update_group(
  p_group_id uuid, p_name text default null, p_emoji text default null, p_color text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_role(p_group_id, array['owner', 'admin']::public.member_role[]);
  update public.groups set
    name  = case when p_name is null then name else private.clean_text(p_name, 'Group name', 60) end,
    emoji = coalesce(p_emoji, emoji),
    color = coalesce(p_color, color)
  where id = p_group_id;
end;
$$;

create or replace function public.delete_group(p_group_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_role(p_group_id, array['owner']::public.member_role[]);
  update public.groups set deleted_at = now() where id = p_group_id;
end;
$$;

-- ============================================================
-- Members
-- ============================================================
create or replace function public.add_member(p_group_id uuid, p_display_name text, p_id uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare mid uuid := coalesce(p_id, gen_random_uuid());
begin
  perform private.require_member(p_group_id);
  if exists (select 1 from public.group_members where id = mid) then return mid; end if;
  begin
    insert into public.group_members (id, group_id, user_id, display_name, role)
    values (mid, p_group_id, null, private.clean_text(p_display_name, 'Name', 60), 'member');
  exception when unique_violation then
    raise exception 'Someone called "%" is already in this group', btrim(p_display_name) using errcode = '22023';
  end;
  return mid;
end;
$$;

create or replace function public.rename_member(p_member_id uuid, p_display_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.group_members; my_role public.member_role;
begin
  select * into t from public.group_members where id = p_member_id;
  if t.id is null then raise exception 'Member not found' using errcode = 'P0002'; end if;
  perform private.require_member(t.group_id);
  my_role := private.group_role(t.group_id);
  -- Anyone can rename themselves or a placeholder; admins can rename anyone.
  if not (t.user_id = auth.uid() or t.user_id is null or my_role in ('owner', 'admin')) then
    raise exception 'Only admins can rename other people' using errcode = '42501';
  end if;
  begin
    update public.group_members set display_name = private.clean_text(p_display_name, 'Name', 60) where id = p_member_id;
  exception when unique_violation then
    raise exception 'Someone called "%" is already in this group', btrim(p_display_name) using errcode = '22023';
  end;
end;
$$;

create or replace function public.remove_member(p_member_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.group_members; my_role public.member_role;
begin
  select * into t from public.group_members where id = p_member_id and left_at is null;
  if t.id is null then raise exception 'Member not found' using errcode = 'P0002'; end if;
  perform private.require_member(t.group_id);
  my_role := private.group_role(t.group_id);
  if not (t.user_id = auth.uid() or my_role in ('owner', 'admin')) then
    raise exception 'Only admins can remove other people' using errcode = '42501';
  end if;
  if t.role = 'owner' and (select count(*) from public.group_members
      where group_id = t.group_id and role = 'owner' and left_at is null) = 1 then
    raise exception 'Make someone else an owner before the last owner leaves' using errcode = '22023';
  end if;
  -- History stays: past expenses still reference this member.
  update public.group_members set left_at = now() where id = p_member_id;
end;
$$;

create or replace function public.set_member_role(p_member_id uuid, p_role public.member_role) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.group_members;
begin
  select * into t from public.group_members where id = p_member_id and left_at is null;
  if t.id is null then raise exception 'Member not found' using errcode = 'P0002'; end if;
  perform private.require_role(t.group_id, array['owner']::public.member_role[]);
  if t.user_id is null then raise exception 'Placeholders cannot have a role' using errcode = '22023'; end if;
  if t.role = 'owner' and p_role <> 'owner' and (select count(*) from public.group_members
      where group_id = t.group_id and role = 'owner' and left_at is null) = 1 then
    raise exception 'A group needs at least one owner' using errcode = '22023';
  end if;
  update public.group_members set role = p_role where id = p_member_id;
end;
$$;

-- ============================================================
-- Trips
-- ============================================================
create or replace function public.create_trip(p_group_id uuid, p_name text, p_emoji text default null, p_id uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare tid uuid := coalesce(p_id, gen_random_uuid());
begin
  perform private.require_member(p_group_id);
  if exists (select 1 from public.trips where id = tid) then return tid; end if;
  insert into public.trips (id, group_id, name, emoji, created_by)
  values (tid, p_group_id, private.clean_text(p_name, 'Trip name', 60), coalesce(p_emoji, '🏖️'), auth.uid());
  return tid;
end;
$$;

create or replace function public.delete_trip(p_trip_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare gid uuid;
begin
  select group_id into gid from public.trips where id = p_trip_id and deleted_at is null;
  if gid is null then raise exception 'Trip not found' using errcode = 'P0002'; end if;
  perform private.require_member(gid);
  update public.trips set deleted_at = now() where id = p_trip_id;
  update public.expenses set deleted_at = now() where trip_id = p_trip_id and deleted_at is null;
end;
$$;

-- ============================================================
-- Expenses
-- p: { id?, group_id, trip_id?, description, amount_minor, currency?, category?,
--      expense_date, split_mode?, receipt_path?, payers: [...], splits: [...] }
-- ============================================================
create or replace function public.create_expense(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  eid uuid := coalesce((p ->> 'id')::uuid, gen_random_uuid());
  gid uuid := (p ->> 'group_id')::uuid;
  tid uuid := nullif(p ->> 'trip_id', '')::uuid;
  amt bigint := (p ->> 'amount_minor')::bigint;
begin
  perform private.require_member(gid);
  if exists (select 1 from public.expenses where id = eid) then return eid; end if; -- retried request
  if amt is null or amt <= 0 then raise exception 'Amount must be more than zero' using errcode = '22023'; end if;
  if tid is not null and not exists (select 1 from public.trips where id = tid and group_id = gid and deleted_at is null) then
    raise exception 'Trip not found in this group' using errcode = '22023';
  end if;
  perform private.validate_shares(gid, p -> 'payers', amt, 'Payers', false);
  perform private.validate_shares(gid, p -> 'splits', amt, 'Split amounts', true);

  insert into public.expenses (id, group_id, trip_id, description, amount_minor, currency, category,
                               expense_date, split_mode, receipt_path, created_by)
  values (eid, gid, tid, private.clean_text(p ->> 'description', 'Description', 120), amt,
          upper(coalesce(p ->> 'currency', (select currency from public.groups where id = gid))),
          coalesce(p ->> 'category', 'other'),
          coalesce((p ->> 'expense_date')::date, current_date),
          coalesce((p ->> 'split_mode')::public.split_mode, 'equal'),
          nullif(p ->> 'receipt_path', ''), auth.uid());
  perform private.write_expense_rows(eid, p -> 'payers', p -> 'splits');
  return eid;
end;
$$;

-- Requires the version the editor started from; fails with 40001 if someone
-- else saved in between, so nobody silently overwrites a friend's edit.
create or replace function public.update_expense(p jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  e public.expenses;
  amt bigint := (p ->> 'amount_minor')::bigint;
  tid uuid := nullif(p ->> 'trip_id', '')::uuid;
begin
  select * into e from public.expenses where id = (p ->> 'id')::uuid for update;
  if e.id is null or e.deleted_at is not null then raise exception 'Expense not found' using errcode = 'P0002'; end if;
  perform private.require_member(e.group_id);
  if (p ->> 'version')::int is distinct from e.version then
    raise exception 'This expense was changed by someone else. Reload and try again.' using errcode = '40001';
  end if;
  if amt is null or amt <= 0 then raise exception 'Amount must be more than zero' using errcode = '22023'; end if;
  if tid is not null and not exists (select 1 from public.trips where id = tid and group_id = e.group_id and deleted_at is null) then
    raise exception 'Trip not found in this group' using errcode = '22023';
  end if;
  perform private.validate_shares(e.group_id, p -> 'payers', amt, 'Payers', false);
  perform private.validate_shares(e.group_id, p -> 'splits', amt, 'Split amounts', true);

  update public.expenses set
    trip_id      = case when p ? 'trip_id' then tid else trip_id end,
    description  = private.clean_text(p ->> 'description', 'Description', 120),
    amount_minor = amt,
    category     = coalesce(p ->> 'category', category),
    expense_date = coalesce((p ->> 'expense_date')::date, expense_date),
    split_mode   = coalesce((p ->> 'split_mode')::public.split_mode, split_mode),
    receipt_path = case when p ? 'receipt_path' then nullif(p ->> 'receipt_path', '') else receipt_path end,
    version      = version + 1
  where id = e.id;
  perform private.write_expense_rows(e.id, p -> 'payers', p -> 'splits');
  return e.version + 1;
end;
$$;

create or replace function public.delete_expense(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare gid uuid;
begin
  select group_id into gid from public.expenses where id = p_id and deleted_at is null;
  if gid is null then raise exception 'Expense not found' using errcode = 'P0002'; end if;
  perform private.require_member(gid);
  update public.expenses set deleted_at = now(), version = version + 1 where id = p_id;
end;
$$;

create or replace function public.restore_expense(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare gid uuid;
begin
  select group_id into gid from public.expenses where id = p_id and deleted_at is not null;
  if gid is null then raise exception 'Expense not found' using errcode = 'P0002'; end if;
  perform private.require_member(gid);
  update public.expenses set deleted_at = null, version = version + 1 where id = p_id;
end;
$$;

-- p_emoji null removes your reaction.
create or replace function public.set_reaction(p_expense_id uuid, p_emoji text) returns void
language plpgsql security definer set search_path = '' as $$
declare gid uuid; mid uuid;
begin
  select group_id into gid from public.expenses where id = p_expense_id and deleted_at is null;
  if gid is null then raise exception 'Expense not found' using errcode = 'P0002'; end if;
  mid := private.require_member(gid);
  if p_emoji is null or btrim(p_emoji) = '' then
    delete from public.expense_reactions where expense_id = p_expense_id and member_id = mid;
  else
    insert into public.expense_reactions (expense_id, member_id, emoji) values (p_expense_id, mid, btrim(p_emoji))
    on conflict (expense_id, member_id) do update set emoji = excluded.emoji, created_at = now();
  end if;
end;
$$;

-- ============================================================
-- Settlements
-- p: { id?, group_id, trip_id?, from_member, to_member, amount_minor, method?, note?, settled_on? }
-- ============================================================
create or replace function public.record_settlement(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  sid uuid := coalesce((p ->> 'id')::uuid, gen_random_uuid());
  gid uuid := (p ->> 'group_id')::uuid;
  tid uuid := nullif(p ->> 'trip_id', '')::uuid;
  f uuid := (p ->> 'from_member')::uuid;
  t uuid := (p ->> 'to_member')::uuid;
  amt bigint := (p ->> 'amount_minor')::bigint;
begin
  perform private.require_member(gid);
  if exists (select 1 from public.settlements where id = sid) then return sid; end if;
  if amt is null or amt <= 0 then raise exception 'Amount must be more than zero' using errcode = '22023'; end if;
  if f is null or t is null or f = t then raise exception 'Pick two different people' using errcode = '22023'; end if;
  if (select count(*) from public.group_members where id in (f, t) and group_id = gid) <> 2 then
    raise exception 'Both people must be in this group' using errcode = '22023';
  end if;
  if tid is not null and not exists (select 1 from public.trips where id = tid and group_id = gid) then
    raise exception 'Trip not found in this group' using errcode = '22023';
  end if;
  insert into public.settlements (id, group_id, trip_id, from_member, to_member, amount_minor, currency, method, note, settled_on, created_by)
  values (sid, gid, tid, f, t, amt,
          upper(coalesce(p ->> 'currency', (select currency from public.groups where id = gid))),
          coalesce((p ->> 'method')::public.settlement_method, 'upi'),
          nullif(btrim(coalesce(p ->> 'note', '')), ''),
          coalesce((p ->> 'settled_on')::date, current_date), auth.uid());
  return sid;
end;
$$;

create or replace function public.delete_settlement(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare gid uuid;
begin
  select group_id into gid from public.settlements where id = p_id and deleted_at is null;
  if gid is null then raise exception 'Settlement not found' using errcode = 'P0002'; end if;
  perform private.require_member(gid);
  update public.settlements set deleted_at = now() where id = p_id;
end;
$$;

-- ============================================================
-- Balances: computed in the database, in minor units, always summing to 0.
-- Pass p_trip_id for one trip (its expenses + settlements made from it).
-- net = paid - owed + sent - received   (positive = is owed money)
-- ============================================================
create or replace function public.group_balances(p_group_id uuid, p_trip_id uuid default null)
returns table (member_id uuid, display_name text, active boolean,
               paid_minor bigint, owed_minor bigint, sent_minor bigint, received_minor bigint, net_minor bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_member(p_group_id);
  return query
  with ex as (
    select e.id from public.expenses e
    where e.group_id = p_group_id and e.deleted_at is null
      and (p_trip_id is null or e.trip_id = p_trip_id)
  ),
  st as (
    select s.* from public.settlements s
    where s.group_id = p_group_id and s.deleted_at is null
      and (p_trip_id is null or s.trip_id = p_trip_id)
  ),
  paid as (select ep.member_id, sum(ep.amount_minor)::bigint v from public.expense_payers ep join ex on ex.id = ep.expense_id group by 1),
  owed as (select es.member_id, sum(es.amount_minor)::bigint v from public.expense_splits es join ex on ex.id = es.expense_id group by 1),
  sent as (select st.from_member member_id, sum(st.amount_minor)::bigint v from st group by 1),
  recv as (select st.to_member member_id, sum(st.amount_minor)::bigint v from st group by 1)
  select m.id, m.display_name, m.left_at is null,
         coalesce(paid.v, 0), coalesce(owed.v, 0), coalesce(sent.v, 0), coalesce(recv.v, 0),
         coalesce(paid.v, 0) - coalesce(owed.v, 0) + coalesce(sent.v, 0) - coalesce(recv.v, 0)
  from public.group_members m
  left join paid on paid.member_id = m.id
  left join owed on owed.member_id = m.id
  left join sent on sent.member_id = m.id
  left join recv on recv.member_id = m.id
  where m.group_id = p_group_id
    and (m.left_at is null or paid.v is not null or owed.v is not null or sent.v is not null or recv.v is not null)
  order by 8 desc, 2;
end;
$$;

-- ============================================================
-- Invites. The raw token is returned once and never stored (only its hash).
-- ============================================================
create or replace function private.hash_token(p_token text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

create or replace function public.create_invite(p_group_id uuid, p_valid_days int default 7, p_max_uses int default 20) returns text
language plpgsql security definer set search_path = '' as $$
declare tok text;
begin
  perform private.require_member(p_group_id);
  if p_valid_days not between 1 and 30 then raise exception 'Invites can last 1 to 30 days' using errcode = '22023'; end if;
  tok := translate(rtrim(encode(extensions.gen_random_bytes(18), 'base64'), '='), '+/', '-_');
  insert into public.invites (group_id, token_hash, created_by, expires_at, max_uses)
  values (p_group_id, private.hash_token(tok), auth.uid(), now() + make_interval(days => p_valid_days), p_max_uses);
  return tok;
end;
$$;

create or replace function private.valid_invite(p_token text) returns public.invites
language plpgsql stable set search_path = '' as $$
declare i public.invites;
begin
  select inv.* into i from public.invites inv
  join public.groups g on g.id = inv.group_id and g.deleted_at is null
  where inv.token_hash = private.hash_token(p_token)
    and inv.revoked_at is null and inv.expires_at > now() and inv.uses < inv.max_uses;
  if i.id is null then raise exception 'This invite link is invalid or has expired' using errcode = 'P0002'; end if;
  return i;
end;
$$;

-- What a person sees before joining: group name and the placeholder names
-- they could claim ("I'm Chirag"). No expense data is revealed.
create or replace function public.invite_preview(p_token text)
returns table (group_id uuid, group_name text, emoji text, color text, member_count int,
               placeholders jsonb, already_member boolean)
language plpgsql stable security definer set search_path = '' as $$
declare i public.invites;
begin
  perform private.require_user();
  i := private.valid_invite(p_token);
  return query
  select g.id, g.name, g.emoji, g.color,
         (select count(*)::int from public.group_members m where m.group_id = g.id and m.left_at is null),
         coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'display_name', m.display_name) order by m.display_name)
                   from public.group_members m where m.group_id = g.id and m.user_id is null and m.left_at is null), '[]'::jsonb),
         private.is_group_member(g.id)
  from public.groups g where g.id = i.group_id;
end;
$$;

create or replace function public.accept_invite(p_token text, p_claim_member_id uuid default null, p_display_name text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_user(); i public.invites; me text;
begin
  i := private.valid_invite(p_token);
  if private.is_group_member(i.group_id) then return i.group_id; end if;

  if p_claim_member_id is not null then
    update public.group_members set user_id = uid
    where id = p_claim_member_id and group_id = i.group_id and user_id is null and left_at is null;
    if not found then raise exception 'That name has already been claimed' using errcode = '22023'; end if;
  else
    me := coalesce(nullif(btrim(p_display_name), ''), (select display_name from public.profiles where id = uid), 'New member');
    begin
      insert into public.group_members (group_id, user_id, display_name, role) values (i.group_id, uid, left(me, 60), 'member');
    exception when unique_violation then
      raise exception 'Someone called "%" is already in this group. Claim that name if it is you, or pick another.', me
        using errcode = '22023';
    end;
  end if;
  update public.invites set uses = uses + 1 where id = i.id;
  return i.group_id;
end;
$$;

create or replace function public.revoke_invite(p_invite_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare gid uuid;
begin
  select group_id into gid from public.invites where id = p_invite_id;
  if gid is null then raise exception 'Invite not found' using errcode = 'P0002'; end if;
  perform private.require_role(gid, array['owner', 'admin']::public.member_role[]);
  update public.invites set revoked_at = now() where id = p_invite_id and revoked_at is null;
end;
$$;

-- ============================================================
-- Privileges: only signed-in users may call the API; internals stay private.
-- ============================================================
revoke all on all functions in schema private from public, anon;
grant execute on function private.is_group_member(uuid), private.group_role(uuid),
  private.my_member_id(uuid), private.shares_group_with(uuid) to authenticated;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('create_group', 'update_group', 'delete_group', 'add_member', 'rename_member',
        'remove_member', 'set_member_role', 'create_trip', 'delete_trip', 'create_expense', 'update_expense',
        'delete_expense', 'restore_expense', 'set_reaction', 'record_settlement', 'delete_settlement',
        'group_balances', 'create_invite', 'invite_preview', 'accept_invite', 'revoke_invite')
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end;
$$;
