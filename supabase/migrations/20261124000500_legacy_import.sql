-- ============================================================
-- SplitPro v2: one-time import of v1 data
--
-- At switch-over the v1 tables are renamed to legacy_groups, legacy_members,
-- legacy_trips, legacy_expenses (see supabase/SWITCHOVER.md), then:
--
--   select private.import_legacy('<owner auth user id>', '<owner''s v1 member name>');
--
-- Rules (identical to src/lib/splits.ts, so balances match to the paisa):
--   * Rupee amounts -> integer paise.
--   * Equal split: amount / n, leftover paise to the first people in split_among.
--   * Custom shares: used as-is. If they don't add up to the amount (v1 allowed
--     +-Rs 0.50), the payer absorbs the difference.
--   * Names in old expenses that are no longer members become "left" members,
--     so history and balances are preserved.
--   * Photos stored inline (data: URLs) are parked in private.legacy_receipts
--     for a script to upload to Storage.
-- Safe to run once; refuses to run twice.
-- ============================================================

create table if not exists private.legacy_receipts (
  expense_id uuid primary key,
  group_id   uuid not null,
  data_url   text not null
);

create or replace function private.legacy_member(p_group_id uuid, p_name text) returns uuid
language plpgsql set search_path = '' as $$
declare mid uuid;
begin
  -- Exact name match, like v1 (it compared names as plain strings).
  select id into mid from public.group_members
  where group_id = p_group_id and display_name = p_name
  order by left_at nulls first limit 1;
  if mid is null then
    insert into public.group_members (group_id, user_id, display_name, role, left_at)
    values (p_group_id, null, left(coalesce(nullif(btrim(p_name), ''), '(unknown)'), 60), 'member', now())
    returning id into mid;
  end if;
  return mid;
end;
$$;

create or replace function private.import_legacy(p_owner uuid default null, p_owner_name text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  g record; m record; t record; e record; r record;
  gid uuid; amt bigint; n int; base bigint; extra int; i int;
  payer uuid; mid uuid; gap bigint; share_sum bigint;
  c_groups int := 0; c_members int := 0; c_trips int := 0; c_expenses int := 0; c_receipts int := 0;
begin
  if exists (select 1 from public.expenses) or exists (select 1 from public.groups) then
    raise exception 'v2 tables already contain data; import refused' using errcode = '22023';
  end if;

  for g in select * from public.legacy_groups order by created_at loop
    insert into public.groups (id, name, emoji, color, created_by, created_at)
    values (g.id, left(g.name, 60), coalesce(g.emoji, '👥'),
            case when g.color ~ '^#[0-9A-Fa-f]{6}$' then g.color else '#00E5A0' end,
            p_owner, coalesce(g.created_at, now()));
    c_groups := c_groups + 1;
  end loop;

  for m in select * from public.legacy_members order by created_at loop
    insert into public.group_members (id, group_id, user_id, display_name, role, created_at)
    values (m.id, m.group_id,
            case when p_owner is not null and m.name = p_owner_name then p_owner end,
            left(m.name, 60),
            case when p_owner is not null and m.name = p_owner_name then 'owner' else 'member' end::public.member_role,
            coalesce(m.created_at, now()));
    c_members := c_members + 1;
  end loop;

  -- Any group without a linked owner gets the importing user as an extra owner,
  -- so someone can always manage it.
  if p_owner is not null then
    insert into public.group_members (group_id, user_id, display_name, role)
    select gr.id, p_owner, coalesce((select display_name from public.profiles where id = p_owner), 'Owner'), 'owner'
    from public.groups gr
    where not exists (select 1 from public.group_members x where x.group_id = gr.id and x.user_id = p_owner);
  end if;

  for t in select * from public.legacy_trips order by created_at loop
    insert into public.trips (id, group_id, name, emoji, created_by, created_at)
    values (t.id, t.group_id, left(t.name, 60), coalesce(t.emoji, '🏖️'), p_owner, coalesce(t.created_at, now()));
    c_trips := c_trips + 1;
  end loop;

  for e in
    select le.*, lt.group_id as gid from public.legacy_expenses le
    join public.legacy_trips lt on lt.id = le.trip_id
    order by le.created_at
  loop
    gid := e.gid;
    amt := round(e.amount * 100)::bigint;
    payer := private.legacy_member(gid, e.paid_by);

    insert into public.expenses (id, group_id, trip_id, description, amount_minor, category, expense_date,
                                 split_mode, created_by, created_at)
    values (e.id, gid, e.trip_id, left(coalesce(nullif(btrim(e.description), ''), 'Expense'), 120), amt,
            case when e.category in ('food','travel','stay','drinks','fun','shopping','fuel','other') then e.category else 'other' end,
            e.expense_date,
            case when e.shares is not null and e.shares <> '{}'::jsonb then 'exact' else 'equal' end::public.split_mode,
            p_owner, coalesce(e.created_at, now()));
    insert into public.expense_payers (expense_id, member_id, amount_minor) values (e.id, payer, amt);

    if e.shares is not null and e.shares <> '{}'::jsonb then
      share_sum := 0;
      for r in select key, value from jsonb_each_text(e.shares) loop
        mid := private.legacy_member(gid, r.key);
        insert into public.expense_splits (expense_id, member_id, amount_minor)
        values (e.id, mid, round(r.value::numeric * 100)::bigint)
        on conflict (expense_id, member_id) do update
          set amount_minor = public.expense_splits.amount_minor + excluded.amount_minor;
        share_sum := share_sum + round(r.value::numeric * 100)::bigint;
      end loop;
      gap := amt - share_sum;
      if gap <> 0 then
        insert into public.expense_splits (expense_id, member_id, amount_minor) values (e.id, payer, gap)
        on conflict (expense_id, member_id) do update
          set amount_minor = public.expense_splits.amount_minor + excluded.amount_minor;
      end if;
    else
      n := coalesce(array_length(e.split_among, 1), 0);
      if n = 0 then
        -- v1 ignored expenses split among nobody; keep it neutral: payer owes it all.
        insert into public.expense_splits (expense_id, member_id, amount_minor) values (e.id, payer, amt);
      else
        base := amt / n;
        extra := (amt - base * n)::int;
        for i in 1 .. n loop
          mid := private.legacy_member(gid, e.split_among[i]);
          insert into public.expense_splits (expense_id, member_id, amount_minor)
          values (e.id, mid, base + case when i <= extra then 1 else 0 end)
          on conflict (expense_id, member_id) do update
            set amount_minor = public.expense_splits.amount_minor + excluded.amount_minor;
        end loop;
      end if;
    end if;

    if e.reactions is not null and jsonb_typeof(e.reactions) = 'object' then
      for r in select key, value from jsonb_each_text(e.reactions) loop
        if r.value is not null and r.value <> '' then
          insert into public.expense_reactions (expense_id, member_id, emoji)
          values (e.id, private.legacy_member(gid, r.key), left(r.value, 16))
          on conflict do nothing;
        end if;
      end loop;
    end if;

    if e.image_url is not null and e.image_url like 'data:%' then
      insert into private.legacy_receipts (expense_id, group_id, data_url) values (e.id, gid, e.image_url);
      c_receipts := c_receipts + 1;
    end if;
    c_expenses := c_expenses + 1;
  end loop;

  return jsonb_build_object('groups', c_groups, 'members', c_members, 'trips', c_trips,
                            'expenses', c_expenses, 'receipts_to_upload', c_receipts);
end;
$$;
revoke all on function private.import_legacy(uuid, text), private.legacy_member(uuid, text) from public, anon, authenticated;
