# Switch-over runbook: v1 tables → v2 schema

Do this **once**, together with the Phase 3 app release (sign-in), because the
v2 access rules need signed-in users. Expected downtime: about 10 minutes.
Rehearse the whole thing on the **staging** project first.

## Before the day
- [ ] Phase 2 + Phase 3 app is merged and tested on a Deploy Preview against **staging**.
- [ ] Staging rehearsal of every step below, using a copy of production data.
- [ ] You (the owner) have signed in to the **production** app once, so your
      auth user exists. Note its id: Supabase → Authentication → Users.
- [ ] Tell the group: "SplitPro will be down for ~10 minutes at <time>. After
      that, sign in with Google and tap your name to link your account."

## On the day
1. **Back up.** Supabase → Database → Backups (Pro plan) *or* export all four
   tables to CSV from the Table Editor. Also keep the JSON backups in `backups/`.
2. **Freeze writes.** In Netlify, publish a "maintenance" deploy *or* simply
   ask the group not to add expenses during the window.
3. **Rename the v1 tables** (SQL Editor):
   ```sql
   begin;
   alter table public.groups   rename to legacy_groups;
   alter table public.members  rename to legacy_members;
   alter table public.trips    rename to legacy_trips;
   alter table public.expenses rename to legacy_expenses;
   commit;
   ```
4. **Apply the v2 migrations** in filename order from `supabase/migrations/`
   (paste each into the SQL Editor, or `supabase db push` once the CLI is linked).
5. **Import**, linking your own v1 member name to your account:
   ```sql
   select private.import_legacy('<your auth user id>', '<your name exactly as in v1>');
   ```
   It returns counts. Expenses must equal the v1 count.
6. **Verify balances** match the v1 app (the importer uses identical maths;
   the automated test `supabase/tests/legacy-import.test.ts` proves it on the backup):
   ```sql
   select g.name, b.display_name, b.net_minor / 100.0 as net_rupees
   from groups g, lateral group_balances(g.id) b order by 1, 4 desc;
   ```
   (Run as yourself from the app, or temporarily via a service-role session.)
7. **Upload parked photos**: `private.legacy_receipts` holds any inline photos;
   run the upload script (Phase 3) to move them into the `receipts` bucket.
8. **Publish the v2 app**: merge the release PR in GitHub.
9. **Invite everyone**: in the app, create an invite link and share it. Each
   friend signs in and claims their existing name, so history stays theirs.

## Afterwards
- Keep the `legacy_*` tables for 30 days, then drop them and the Phase 0
  passcode objects (`private.app_secret`, `private.has_access`,
  `public.splitpro_check_access`).

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
The v1 app (still live until step 8) works again immediately; the Phase 0
passcode objects were never touched. Investigate the `v2_failed_*` tables,
then drop them and the other v2 objects before retrying.
After step 8, roll back the app in Netlify → Deploys → previous deploy → Publish.
