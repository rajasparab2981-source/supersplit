# Switch-over runbook: v1 tables → v2 schema

Do this **once**, together with the release of the v2 app (sign-in), because
the v2 access rules need signed-in users. Expected downtime: about 15 minutes.

## Rehearsal status (2026-11-24)
- **Local replica of production** (`npm test`, `supabase/tests/switchover-rehearsal.test.ts`):
  live v1 schema, RLS, Phase 0 lockdown, realtime publication and the real data.
  Rename → all migrations → import → balances match the v1 app **to the paisa**;
  rollback restores a working v1 app. ✅
- **Staging (real Supabase)**: real data imported, owner linked, all 6 balances
  identical to the live app, sums 0. ✅
- **Found by the rehearsal and fixed**: migration 0300 revoked the Phase 0
  function `private.has_access()`, which would have broken the v1 app after a
  rollback. Fixed by migration 0900.

Re-run the rehearsal just before the real switch-over with a fresh backup.

## Decide first: same project, or move to Mumbai?
The live project is in **Tokyo** (ap-northeast-1); Indian users would get
noticeably faster responses from **Mumbai** (ap-south-1). A region cannot be
changed in place, so moving means a new project:
- **Same project (this runbook)**: simplest, no new keys.
- **New Mumbai project**: create it, `db push` the migrations, create the
  `legacy_*` tables there and load the backup (as done on staging with
  `backups/live-*/staging-rehearsal.sql`), run the import, then point the app
  at the new project. The old project stays untouched as the rollback.

## Before the day
- [ ] v2 app merged into a release PR and tested on its Deploy Preview against staging.
- [ ] Fresh rehearsal passes (`npm test` with a new `backups/live-<date>/` export).
- [ ] Production **auth settings** prepared (do NOT push `supabase/config.jsonc` as-is:
      it enables anonymous sign-ins for staging):
      site URL `https://supersplit.netlify.app`, redirect URLs, **anonymous sign-ins OFF**.
- [ ] Google: add the production callback
      `https://<prod-ref>.supabase.co/auth/v1/callback` to the Google OAuth client,
      and enable the Google provider in the production project (secret pasted by you).
- [ ] `netlify.toml` production context pointed at the production URL + publishable key.
- [ ] You (the owner) have signed in to the production app once (auth user exists).
- [ ] Tell the group: "SplitPro will be down ~15 minutes at <time>. Afterwards, sign
      in with Google and tap your name to keep your history."

## On the day
1. **Back up** (Docker isn't needed). Export each v1 table read-only:
   ```bash
   npx supabase db query --remote=<prod-ref> --read-only \
     "select coalesce(json_agg(t order by created_at),'[]') j from public.expenses t"
   ```
   (repeat for groups, members, trips; keep the files in `backups/live-<date>/`).
2. **Freeze writes**: ask the group not to add expenses during the window.
3. **Rename the v1 tables** (SQL Editor or `db query`):
   ```sql
   begin;
   alter table public.groups   rename to legacy_groups;
   alter table public.members  rename to legacy_members;
   alter table public.trips    rename to legacy_trips;
   alter table public.expenses rename to legacy_expenses;
   commit;
   ```
4. **Apply all v2 migrations** (0100–0900): `npx supabase db push --remote=<prod-ref>`
   after checking `--dry-run`.
5. **Import**, linking your account to your v1 name (exactly as spelled in v1, e.g. `Rajas`):
   ```sql
   select private.import_legacy('<your auth user id>', 'Rajas');
   ```
   The returned `expenses` count must equal the v1 count.
6. **Verify balances** as the owner (see `backups/live-*/check-balances.sql` for the
   pattern) and compare with the v1 app; they must match to the paisa.
7. **Photos**: `select count(*) from private.legacy_receipts;` (0 on 2026-11-24, so
   nothing to upload unless photos were added since).
8. **Publish the v2 app**: merge the release PR.
9. **Invite everyone**: create an invite link in the app and share it; each friend
   signs in and taps their own name.

## Afterwards (30 days later)
Drop the `legacy_*` tables and the Phase 0 objects (`private.app_secret`,
`private.has_access`, `private.set_passcode`, `public.splitpro_check_access`).

## Rollback (if something is wrong before step 8)
The v2 tables use the same names as v1 (`groups`, `trips`, `expenses`), so
move them out of the way first, then put the v1 tables back:
```sql
begin;
alter table public.groups   rename to v2_failed_groups;
alter table public.trips    rename to v2_failed_trips;
alter table public.expenses rename to v2_failed_expenses;
alter table public.legacy_groups   rename to groups;
alter table public.legacy_members  rename to members;
alter table public.legacy_trips    rename to trips;
alter table public.legacy_expenses rename to expenses;
commit;
```
The v1 app (still live until step 8) works again immediately; this is covered by
the rehearsal test. Investigate the `v2_failed_*` tables, then drop them and the
other v2 objects before retrying.
After step 8, roll back the app in Netlify → Deploys → previous deploy → Publish.
