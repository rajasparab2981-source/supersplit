-- ============================================================
-- SplitPro Premium, milestone 0: categories table and entitlements (trial).
--
-- Categories: the 8 hard-coded categories become rows, 6 more are added, and
-- groups can have custom categories (a Premium feature). expenses.category
-- keeps holding the category id, so existing rows and app code are unchanged.
--
-- Entitlements: every account gets a 30-day Premium trial. After it ends the
-- plan is 'free' until a paid period is recorded (premium_until), which the
-- payment integration will set later. Premium checks happen in the database.
-- ============================================================

-- ---------- Categories ----------
create table public.categories (
  id          text primary key check (id ~ '^[a-z0-9_]{1,64}$'),
  group_id    uuid references public.groups (id) on delete cascade, -- null = built-in
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  emoji       text not null default '📌' check (char_length(emoji) <= 16),
  sort_order  integer not null default 100,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);
create index categories_group_idx on public.categories (group_id);
create index categories_created_by_idx on public.categories (created_by);

insert into public.categories (id, name, emoji, sort_order) values
  ('food',       'Food',       '🍔', 10),
  ('groceries',  'Groceries',               '🛒', 20),
  ('travel',     'Travel',                  '✈️', 30),
  ('stay',       'Stay',       '🏨', 40),
  ('transport',  'Transport',  '🚕', 50),
  ('fuel',       'Fuel',                    '⛽', 60),
  ('activities', 'Activities', '🎟️', 70),
  ('fun',        'Fun',        '🎉', 80),
  ('drinks',     'Drinks',                  '🍹', 90),
  ('shopping',   'Shopping',                '🛍️', 100),
  ('rent',       'Rent',                    '🏠', 110),
  ('utilities',  'Utilities',               '💡', 120),
  ('medical',    'Medical',                 '💊', 130),
  ('other',      'Other',                   '📌', 999);

alter table public.expenses drop constraint if exists expenses_category_check;
alter table public.expenses
  add constraint expenses_category_fkey foreign key (category) references public.categories (id);
create index if not exists expenses_category_idx on public.expenses (category);

-- An expense may use a built-in category or one of its own group's.
create or replace function private.check_expense_category() returns trigger
language plpgsql set search_path = '' as $$
declare cat_group uuid; found boolean;
begin
  select true, c.group_id into found, cat_group from public.categories c where c.id = new.category;
  if found is not true then
    raise exception 'Unknown category "%"', new.category using errcode = '22023';
  end if;
  if cat_group is not null and cat_group <> new.group_id then
    raise exception 'That category belongs to another group' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger expenses_category_valid
  before insert or update of category, group_id on public.expenses
  for each row execute function private.check_expense_category();

alter table public.categories enable row level security;
revoke all on public.categories from anon, authenticated;
grant select on public.categories to authenticated;
create policy categories_select on public.categories for select to authenticated
  using (group_id is null or private.is_group_member(group_id));

-- ---------- Entitlements ----------
create table public.entitlements (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  trial_ends_at  timestamptz not null,
  premium_until  timestamptz,           -- set by the payment integration (later)
  updated_at     timestamptz not null default now()
);
alter table public.entitlements enable row level security;
revoke all on public.entitlements from anon, authenticated;
grant select on public.entitlements to authenticated;
create policy entitlements_select on public.entitlements for select to authenticated
  using (user_id = (select auth.uid()));

-- Everyone with a profile gets a 30-day trial: existing accounts from today.
insert into public.entitlements (user_id, trial_ends_at)
select p.id, now() + interval '30 days' from public.profiles p
on conflict (user_id) do nothing;

create or replace function private.start_trial() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.entitlements (user_id, trial_ends_at)
  values (new.id, now() + interval '30 days')
  on conflict (user_id) do nothing;
  return new;
end;
$$;
create trigger profiles_start_trial after insert on public.profiles
  for each row execute function private.start_trial();

create or replace function private.is_premium() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.entitlements e
    where e.user_id = auth.uid()
      and (e.premium_until > now() or e.trial_ends_at > now())
  );
$$;

create or replace function private.require_premium() returns void
language plpgsql stable set search_path = '' as $$
begin
  perform private.require_user();
  if not private.is_premium() then
    raise exception 'This is a Premium feature' using errcode = 'P0003';
  end if;
end;
$$;

-- plan: 'premium' (paid) | 'trial' | 'free'
create or replace function public.my_plan()
returns table (plan text, trial_ends_at timestamptz, premium_until timestamptz, days_left integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_user();
  return query
  select case when e.premium_until > now() then 'premium'
              when e.trial_ends_at > now() then 'trial'
              else 'free' end,
         e.trial_ends_at, e.premium_until,
         greatest(0, ceil(extract(epoch from (greatest(coalesce(e.premium_until, e.trial_ends_at), e.trial_ends_at) - now())) / 86400))::int
  from public.entitlements e where e.user_id = auth.uid();
end;
$$;

-- ---------- Custom categories (Premium) ----------
create or replace function public.create_category(p_group_id uuid, p_name text, p_emoji text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare cid text := 'c_' || replace(gen_random_uuid()::text, '-', '');
begin
  perform private.require_member(p_group_id);
  perform private.require_premium();
  if exists (select 1 from public.categories c
             where (c.group_id is null or c.group_id = p_group_id) and c.archived_at is null
               and lower(btrim(c.name)) = lower(btrim(p_name))) then
    raise exception 'A category called "%" already exists', btrim(p_name) using errcode = '22023';
  end if;
  insert into public.categories (id, group_id, name, emoji, sort_order, created_by)
  values (cid, p_group_id, private.clean_text(p_name, 'Category name', 40), coalesce(nullif(btrim(p_emoji), ''), '🏷️'), 500, auth.uid());
  return cid;
end;
$$;

create or replace function public.archive_category(p_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare gid uuid;
begin
  select group_id into gid from public.categories where id = p_id;
  if gid is null then raise exception 'Built-in categories cannot be removed' using errcode = '22023'; end if;
  perform private.require_member(gid);
  -- Past expenses keep the category; it just stops being offered.
  update public.categories set archived_at = now() where id = p_id;
end;
$$;

revoke all on function private.check_expense_category(), private.start_trial(), private.is_premium(),
  private.require_premium() from public, anon;
grant execute on function private.is_premium(), private.require_premium() to authenticated;
revoke all on function public.my_plan(), public.create_category(uuid, text, text), public.archive_category(text) from public, anon;
grant execute on function public.my_plan(), public.create_category(uuid, text, text), public.archive_category(text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.categories, public.entitlements;
  end if;
end;
$$;
