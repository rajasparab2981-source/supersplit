-- ============================================================
-- SplitPro v2: pick up a real name when a provider supplies one later.
--
-- Someone who signs up by email gets a placeholder profile name (the part of
-- the address before @). If they later sign in with Google (same address,
-- same account), Google's full name arrives in auth.users metadata. Use it,
-- but only while the profile still has the placeholder - never overwrite a
-- name the person chose themselves.
-- ============================================================

create or replace function private.handle_user_metadata_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  new_name text := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
                            nullif(btrim(new.raw_user_meta_data ->> 'name'), ''));
  placeholder text := nullif(split_part(coalesce(new.email, ''), '@', 1), '');
begin
  if new_name is null then return new; end if;
  update public.profiles p
     set display_name = left(new_name, 60)
   where p.id = new.id
     and (p.display_name = placeholder or p.display_name = 'SplitPro user');
  return new;
end;
$$;
revoke all on function private.handle_user_metadata_update() from public, anon, authenticated;

create trigger on_auth_user_metadata_updated
  after update of raw_user_meta_data on auth.users
  for each row
  when (old.raw_user_meta_data is distinct from new.raw_user_meta_data)
  execute function private.handle_user_metadata_update();

-- One-time backfill for accounts that already linked a provider before this
-- trigger existed (same rule: only replace the email-derived placeholder).
update public.profiles p
   set display_name = left(coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                                    nullif(btrim(u.raw_user_meta_data ->> 'name'), '')), 60)
  from auth.users u
 where u.id = p.id
   and coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(u.raw_user_meta_data ->> 'name'), '')) is not null
   and (p.display_name = nullif(split_part(coalesce(u.email, ''), '@', 1), '') or p.display_name = 'SplitPro user');
