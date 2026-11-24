-- ============================================================
-- SplitPro v2: activity log, receipt storage, realtime
-- ============================================================

-- ---------- Activity log (written by triggers, so nothing can skip it) ----------
create or replace function private.log_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  row_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  row_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  r jsonb := coalesce(row_new, row_old);
  entity text := case tg_table_name when 'expenses' then 'expense' when 'settlements' then 'settlement'
                                    when 'group_members' then 'member' when 'trips' then 'trip' else tg_table_name end;
  act text;
  summary jsonb;
begin
  act := case
    when tg_op = 'INSERT' then 'created'
    when row_old ? 'deleted_at' and (row_old ->> 'deleted_at') is null and (row_new ->> 'deleted_at') is not null then 'deleted'
    when row_old ? 'deleted_at' and (row_old ->> 'deleted_at') is not null and (row_new ->> 'deleted_at') is null then 'restored'
    when row_old ? 'left_at' and (row_old ->> 'left_at') is null and (row_new ->> 'left_at') is not null then 'removed'
    when row_old ? 'user_id' and (row_old ->> 'user_id') is null and (row_new ->> 'user_id') is not null then 'claimed'
    else 'updated'
  end;
  summary := case tg_table_name
    when 'expenses' then jsonb_build_object('description', r ->> 'description', 'amount_minor', (r ->> 'amount_minor')::bigint,
                                            'currency', r ->> 'currency', 'version', (r ->> 'version')::int)
    when 'settlements' then jsonb_build_object('from_member', r ->> 'from_member', 'to_member', r ->> 'to_member',
                                               'amount_minor', (r ->> 'amount_minor')::bigint, 'method', r ->> 'method')
    when 'group_members' then jsonb_build_object('display_name', r ->> 'display_name', 'role', r ->> 'role')
    when 'trips' then jsonb_build_object('name', r ->> 'name')
    else '{}'::jsonb end;
  insert into public.activity_log (group_id, actor_id, action, entity_id, data)
  values ((r ->> 'group_id')::uuid, auth.uid(), entity || '.' || act, (r ->> 'id')::uuid, summary);
  return null;
end;
$$;
revoke all on function private.log_activity() from public, anon, authenticated;

create trigger expenses_activity after insert or update on public.expenses
  for each row execute function private.log_activity();
create trigger settlements_activity after insert or update on public.settlements
  for each row execute function private.log_activity();
create trigger group_members_activity after insert or update on public.group_members
  for each row execute function private.log_activity();
create trigger trips_activity after insert or update on public.trips
  for each row execute function private.log_activity();

-- ---------- Receipt storage ----------
-- Private bucket. Object path: <group_id>/<expense_id or uuid>.<ext>
-- Only active members of that group can upload, view or delete. The app
-- shows receipts through short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.receipt_group(p_name text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return ((storage.foldername(p_name))[1])::uuid;
exception when others then
  return null; -- not a UUID folder: no access
end;
$$;
grant execute on function private.receipt_group(text) to authenticated;

create policy receipts_select on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and private.is_group_member(private.receipt_group(name)));
create policy receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and private.is_group_member(private.receipt_group(name)));
create policy receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and private.is_group_member(private.receipt_group(name)));

-- ---------- Realtime ----------
-- Clients subscribe per group (filter group_id=eq.<id>); Realtime applies the
-- RLS rules above, so nobody receives changes from groups they're not in.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.groups, public.group_members, public.trips, public.expenses,
      public.expense_reactions, public.settlements, public.activity_log;
  end if;
end;
$$;
