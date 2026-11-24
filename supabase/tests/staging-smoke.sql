-- Live behaviour check against a real Supabase project (staging).
-- Everything runs in ONE transaction that is ROLLED BACK: nothing is kept.
-- Run:  npx supabase db query --remote -f supabase/tests/staging-smoke.sql

begin;

create temp table smoke (n serial, check_name text, ok boolean, detail text) on commit drop;
grant all on smoke to authenticated, anon;
grant usage on sequence smoke_n_seq to authenticated, anon;

-- Two users via the real auth.users table (fires the profile trigger).
insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-00000000a5a1', 'authenticated', 'authenticated', 'asha@smoke.test', '{"full_name":"Asha"}', now(), now()),
       ('00000000-0000-4000-8000-00000000a5a2', 'authenticated', 'authenticated', 'mallory@smoke.test', '{"full_name":"Mallory"}', now(), now());

insert into smoke (check_name, ok, detail)
select 'profile created on signup', count(*) = 2, string_agg(display_name, ', ')
from public.profiles where id in ('00000000-0000-4000-8000-00000000a5a1', '00000000-0000-4000-8000-00000000a5a2');

-- ---------- As Asha ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a5a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare g uuid; a uuid; b uuid; e uuid; net jsonb; tok text;
begin
  g := public.create_group('Smoke Test', '🧪');
  select id into a from public.group_members where group_id = g;
  b := public.add_member(g, 'Bilal');
  e := public.create_expense(jsonb_build_object('group_id', g, 'description', 'Dinner', 'amount_minor', 10000,
        'expense_date', current_date, 'payers', jsonb_build_array(jsonb_build_object('member_id', a, 'amount_minor', 10000)),
        'splits', jsonb_build_array(jsonb_build_object('member_id', a, 'amount_minor', 5000), jsonb_build_object('member_id', b, 'amount_minor', 5000))));
  select jsonb_object_agg(display_name, net_minor) into net from public.group_balances(g);
  insert into smoke (check_name, ok, detail) values ('member creates group + expense; balances', net = '{"Asha":5000,"Bilal":-5000}'::jsonb, net::text);

  begin
    perform public.create_expense(jsonb_build_object('group_id', g, 'description', 'Bad', 'amount_minor', 10000,
        'payers', jsonb_build_array(jsonb_build_object('member_id', a, 'amount_minor', 10000)),
        'splits', jsonb_build_array(jsonb_build_object('member_id', b, 'amount_minor', 9999))));
    insert into smoke (check_name, ok, detail) values ('unbalanced expense rejected', false, 'was accepted!');
  exception when others then
    insert into smoke (check_name, ok, detail) values ('unbalanced expense rejected', sqlstate = '22023', sqlerrm);
  end;

  begin
    insert into public.expenses (group_id, description, amount_minor, expense_date) values (g, 'direct', 1, current_date);
    insert into smoke (check_name, ok, detail) values ('direct table write blocked', false, 'was allowed!');
  exception when others then
    insert into smoke (check_name, ok, detail) values ('direct table write blocked', sqlstate = '42501', sqlerrm);
  end;

  insert into storage.objects (bucket_id, name) values ('receipts', g::text || '/smoke.jpg');
  insert into smoke (check_name, ok, detail) values ('member can upload a receipt to own group folder', true, g::text || '/smoke.jpg');

  tok := public.create_invite(g);
  insert into smoke (check_name, ok, detail) values ('invite token created', length(tok) >= 20, length(tok)::text || ' chars');
  perform set_config('smoke.group', g::text, true);
  perform set_config('smoke.token', tok, true);
end $$;

-- ---------- As Mallory (not in the group) ----------
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a5a2","role":"authenticated"}', true);
set local role authenticated;
do $$
declare g uuid := current_setting('smoke.group')::uuid; n int; p record;
begin
  select count(*) into n from public.groups;
  insert into smoke (check_name, ok, detail) values ('outsider sees no groups', n = 0, n::text);
  select count(*) into n from public.expenses;
  insert into smoke (check_name, ok, detail) values ('outsider sees no expenses', n = 0, n::text);
  select count(*) into n from storage.objects where bucket_id = 'receipts';
  insert into smoke (check_name, ok, detail) values ('outsider sees no receipts', n = 0, n::text);
  begin
    perform * from public.group_balances(g);
    insert into smoke (check_name, ok, detail) values ('outsider cannot read balances', false, 'was allowed!');
  exception when others then
    insert into smoke (check_name, ok, detail) values ('outsider cannot read balances', sqlstate = '42501', sqlerrm);
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('receipts', g::text || '/evil.jpg');
    insert into smoke (check_name, ok, detail) values ('outsider cannot upload to group folder', false, 'was allowed!');
  exception when others then
    insert into smoke (check_name, ok, detail) values ('outsider cannot upload to group folder', sqlstate = '42501', sqlerrm);
  end;
  select * into p from public.invite_preview(current_setting('smoke.token'));
  insert into smoke (check_name, ok, detail) values ('invite preview shows group + claimable names',
    p.group_name = 'Smoke Test' and p.placeholders @> '[{"display_name":"Bilal"}]', p.group_name || ' ' || p.placeholders::text);
  perform public.accept_invite(current_setting('smoke.token'), (p.placeholders -> 0 ->> 'id')::uuid);
  select count(*) into n from public.expenses;
  insert into smoke (check_name, ok, detail) values ('after claiming via invite, sees the expense', n = 1, n::text);
end $$;

-- ---------- Signed out ----------
reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.groups;
    insert into smoke (check_name, ok, detail) values ('signed-out visitor blocked from tables', false, 'was allowed!');
  exception when others then
    insert into smoke (check_name, ok, detail) values ('signed-out visitor blocked from tables', sqlstate = '42501', sqlerrm);
  end;
  begin
    perform public.create_group('x');
    insert into smoke (check_name, ok, detail) values ('signed-out visitor blocked from functions', false, 'was allowed!');
  exception when others then
    insert into smoke (check_name, ok, detail) values ('signed-out visitor blocked from functions', sqlstate = '42501', sqlerrm);
  end;
end $$;

reset role;
select n, case when ok then 'PASS' else 'FAIL' end as result, check_name, left(detail, 70) as detail from smoke order by n;

rollback;
