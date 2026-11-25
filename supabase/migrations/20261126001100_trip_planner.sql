-- ============================================================
-- SplitPro Premium, milestone 2: Smart Trip Planner (core)
--
-- A trip gains planning details (destination, dates, travellers, style,
-- status, overall budget, buffer) and budget lines. The ACTUAL side of the
-- budget is the trip's real expenses, so nothing is entered twice.
--
-- Budget lines belong to one of seven sections; the buffer is a percentage on
-- the trip. Each line: unit price x quantity x people x days, optionally tied
-- to a day, with booking / paid status and an optional split between members.
--
-- Reading the plan is open to every group member. Changing it is a Premium
-- feature (trial included), checked here in the database.
-- ============================================================

alter table public.trips
  add column destination      text check (destination is null or char_length(destination) <= 80),
  add column start_location   text check (start_location is null or char_length(start_location) <= 80),
  add column start_date       date,
  add column end_date         date,
  add column adults           integer check (adults is null or adults between 0 and 500),
  add column children         integer check (children is null or children between 0 and 500),
  add column travel_type      text check (travel_type is null or travel_type in ('solo', 'couple', 'friends', 'family', 'group')),
  add column travel_style     text check (travel_style is null or travel_style in ('budget', 'standard', 'premium', 'luxury')),
  -- Existing trips are already being used to track expenses: 'active'.
  add column status           text not null default 'active' check (status in ('planning', 'active', 'completed')),
  add column budget_minor     bigint check (budget_minor is null or budget_minor between 0 and 100000000000),
  add column buffer_pct       numeric(5,2) not null default 10 check (buffer_pct between 0 and 100),
  add column alert_thresholds integer[] not null default '{50,75,90,100}',
  add column prefs            jsonb not null default '{}'::jsonb,   -- transport / stay preferences, planned activities
  add column updated_at       timestamptz not null default now(),
  add constraint trips_dates_ordered check (start_date is null or end_date is null or end_date >= start_date);

create trigger trips_touch before update on public.trips
  for each row execute function private.touch_updated_at();

create table public.trip_budget_items (
  id               uuid primary key default gen_random_uuid(),
  trip_id          uuid not null references public.trips (id) on delete cascade,
  group_id         uuid not null references public.groups (id) on delete cascade,
  section          text not null check (section in ('transport', 'stay', 'food', 'activities', 'shopping', 'essentials', 'misc')),
  label            text not null check (char_length(btrim(label)) between 1 and 80),
  day_date         date,                                   -- set = part of the day-by-day plan
  unit_price_minor bigint not null check (unit_price_minor between 0 and 100000000000),
  quantity         numeric(10,2) not null default 1 check (quantity > 0 and quantity <= 100000),
  people           integer not null default 1 check (people between 1 and 500),
  days             integer not null default 1 check (days between 1 and 366),
  estimated_minor  bigint not null check (estimated_minor between 0 and 100000000000),
  notes            text check (notes is null or char_length(notes) <= 300),
  booking_status   text not null default 'none' check (booking_status in ('none', 'to_book', 'booked')),
  paid             boolean not null default false,
  -- Who shares this line. Both null = everyone equally. split_members = only
  -- these people, equally. shares = exact amounts per member (sums to the estimate).
  split_members    uuid[],
  shares           jsonb,
  -- Where the number came from; shown next to every amount.
  source           text not null default 'user' check (source in ('user', 'personal_history', 'group_history')),
  status           text not null default 'accepted' check (status in ('accepted', 'suggested')),
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index trip_budget_items_trip_idx on public.trip_budget_items (trip_id) where deleted_at is null;
create index trip_budget_items_group_idx on public.trip_budget_items (group_id);
create index trip_budget_items_created_by_idx on public.trip_budget_items (created_by);
create trigger trip_budget_items_touch before update on public.trip_budget_items
  for each row execute function private.touch_updated_at();

alter table public.trip_budget_items enable row level security;
revoke all on public.trip_budget_items from anon, authenticated;
grant select on public.trip_budget_items to authenticated;
create policy trip_budget_items_select on public.trip_budget_items for select to authenticated
  using (private.is_group_member(group_id));

-- ---------- Trip details ----------
-- p: { trip_id, name?, emoji?, destination?, start_location?, start_date?, end_date?, adults?, children?,
--      travel_type?, travel_style?, status?, budget_minor?, buffer_pct?, alert_thresholds?, prefs? }
-- Only the keys present are changed; an explicit null clears a value.
create or replace function public.update_trip_plan(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.trips; th int[];
begin
  select * into t from public.trips where id = (p ->> 'trip_id')::uuid and deleted_at is null;
  if t.id is null then raise exception 'Trip not found' using errcode = 'P0002'; end if;
  perform private.require_member(t.group_id);
  perform private.require_premium();

  if p ? 'alert_thresholds' then
    select coalesce(array_agg(distinct v order by v), '{}') into th
    from (select (jsonb_array_elements_text(p -> 'alert_thresholds'))::int as v) x;
    if exists (select 1 from unnest(th) v where v not between 1 and 200) or coalesce(array_length(th, 1), 0) > 8 then
      raise exception 'Alert levels must be between 1 and 200 percent (up to 8 levels)' using errcode = '22023';
    end if;
  end if;

  begin
    update public.trips set
      name             = case when p ? 'name' then private.clean_text(p ->> 'name', 'Trip name', 60) else name end,
      emoji            = case when p ? 'emoji' then coalesce(nullif(p ->> 'emoji', ''), emoji) else emoji end,
      destination      = case when p ? 'destination' then nullif(btrim(p ->> 'destination'), '') else destination end,
      start_location   = case when p ? 'start_location' then nullif(btrim(p ->> 'start_location'), '') else start_location end,
      start_date       = case when p ? 'start_date' then nullif(p ->> 'start_date', '')::date else start_date end,
      end_date         = case when p ? 'end_date' then nullif(p ->> 'end_date', '')::date else end_date end,
      adults           = case when p ? 'adults' then (p ->> 'adults')::int else adults end,
      children         = case when p ? 'children' then (p ->> 'children')::int else children end,
      travel_type      = case when p ? 'travel_type' then nullif(p ->> 'travel_type', '') else travel_type end,
      travel_style     = case when p ? 'travel_style' then nullif(p ->> 'travel_style', '') else travel_style end,
      status           = case when p ? 'status' then p ->> 'status' else status end,
      budget_minor     = case when p ? 'budget_minor' then (p ->> 'budget_minor')::bigint else budget_minor end,
      buffer_pct       = case when p ? 'buffer_pct' then (p ->> 'buffer_pct')::numeric else buffer_pct end,
      alert_thresholds = case when p ? 'alert_thresholds' then th else alert_thresholds end,
      prefs            = case when p ? 'prefs' then coalesce(p -> 'prefs', '{}'::jsonb) else prefs end
    where id = t.id;
  exception
    when check_violation then
      raise exception 'Some trip details are not valid (check the dates, traveller numbers and percentages)' using errcode = '22023';
    when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
      raise exception 'Some trip details are not valid' using errcode = '22023';
  end;
end;
$$;

-- ---------- Budget lines ----------
-- p: { id?, trip_id, section, label, day_date?, unit_price_minor, quantity?, people?, days?, notes?,
--      booking_status?, paid?, split_members?: [member ids], shares?: { member_id: minor }, source?, status? }
-- Creates the line, or updates it when `id` already exists (safe to retry).
create or replace function public.save_budget_item(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  iid uuid := coalesce((p ->> 'id')::uuid, gen_random_uuid());
  t public.trips;
  unit bigint := (p ->> 'unit_price_minor')::bigint;
  qty numeric := coalesce((p ->> 'quantity')::numeric, 1);
  ppl int := coalesce((p ->> 'people')::int, 1);
  dys int := coalesce((p ->> 'days')::int, 1);
  est bigint;
  members uuid[];
  shares jsonb := case when jsonb_typeof(p -> 'shares') = 'object' and p -> 'shares' <> '{}'::jsonb then p -> 'shares' end;
  share_sum bigint;
begin
  select * into t from public.trips where id = (p ->> 'trip_id')::uuid and deleted_at is null;
  if t.id is null then raise exception 'Trip not found' using errcode = 'P0002'; end if;
  perform private.require_member(t.group_id);
  perform private.require_premium();
  if exists (select 1 from public.trip_budget_items i where i.id = iid and i.trip_id <> t.id) then
    raise exception 'That budget line belongs to another trip' using errcode = '22023';
  end if;
  if unit is null or unit < 0 or qty <= 0 or ppl < 1 or dys < 1 then
    raise exception 'Enter a price, and a quantity, people and days of at least 1' using errcode = '22023';
  end if;
  est := round(unit * qty * ppl * dys);
  if est > 100000000000 then raise exception 'That amount is too large' using errcode = '22023'; end if;

  if jsonb_typeof(p -> 'split_members') = 'array' and jsonb_array_length(p -> 'split_members') > 0 then
    select array_agg(distinct v::uuid) into members from jsonb_array_elements_text(p -> 'split_members') v;
    if exists (select 1 from unnest(members) m where not exists
        (select 1 from public.group_members gm where gm.id = m and gm.group_id = t.group_id)) then
      raise exception 'The split includes someone who is not in this group' using errcode = '22023';
    end if;
  end if;
  if shares is not null then
    if exists (select 1 from jsonb_each_text(shares) s where not exists
        (select 1 from public.group_members gm where gm.id = s.key::uuid and gm.group_id = t.group_id)) then
      raise exception 'The split includes someone who is not in this group' using errcode = '22023';
    end if;
    select sum(s.value::bigint) into share_sum from jsonb_each_text(shares) s;
    if share_sum <> est or exists (select 1 from jsonb_each_text(shares) s where s.value::bigint < 0) then
      raise exception 'The split amounts add up to % but the line is % (minor units)', share_sum, est using errcode = '22023';
    end if;
    members := null;
  end if;

  begin
    insert into public.trip_budget_items (id, trip_id, group_id, section, label, day_date, unit_price_minor, quantity,
      people, days, estimated_minor, notes, booking_status, paid, split_members, shares, source, status, created_by)
    values (iid, t.id, t.group_id, p ->> 'section', private.clean_text(p ->> 'label', 'Name', 80),
      nullif(p ->> 'day_date', '')::date, unit, qty, ppl, dys, est, nullif(btrim(coalesce(p ->> 'notes', '')), ''),
      coalesce(p ->> 'booking_status', 'none'), coalesce((p ->> 'paid')::boolean, false), members, shares,
      coalesce(p ->> 'source', 'user'), coalesce(p ->> 'status', 'accepted'), auth.uid())
    on conflict (id) do update set
      section = excluded.section, label = excluded.label, day_date = excluded.day_date,
      unit_price_minor = excluded.unit_price_minor, quantity = excluded.quantity, people = excluded.people,
      days = excluded.days, estimated_minor = excluded.estimated_minor, notes = excluded.notes,
      booking_status = excluded.booking_status, paid = excluded.paid, split_members = excluded.split_members,
      shares = excluded.shares, source = excluded.source, status = excluded.status, deleted_at = null;
  exception
    when check_violation or not_null_violation then
      raise exception 'Some budget line details are not valid' using errcode = '22023';
  end;
  return iid;
end;
$$;

create or replace function public.delete_budget_item(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare gid uuid;
begin
  select group_id into gid from public.trip_budget_items where id = p_id and deleted_at is null;
  if gid is null then raise exception 'Budget line not found' using errcode = 'P0002'; end if;
  perform private.require_member(gid);
  perform private.require_premium();
  update public.trip_budget_items set deleted_at = now() where id = p_id;
end;
$$;

revoke all on function public.update_trip_plan(jsonb), public.save_budget_item(jsonb), public.delete_budget_item(uuid) from public, anon;
grant execute on function public.update_trip_plan(jsonb), public.save_budget_item(jsonb), public.delete_budget_item(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.trip_budget_items;
  end if;
end;
$$;
