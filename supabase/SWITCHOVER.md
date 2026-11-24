# Go-live runbook: v1 (Tokyo) → v2 (Mumbai)

**Decision (2026-11-24):** promote the Mumbai project `ajcepfpmasykfrdfhtzq`
(created as "splitpro-staging") to production. The Tokyo v1 project
`uardivkwulfjwgmwmsqn` is **not modified**: it stays as the rollback for a
week, then is paused (restorable for 90 days). Expected downtime: ~15 minutes.

## Rehearsal status (2026-11-24)
- Local replica of production (`supabase/tests/switchover-rehearsal.test.ts`):
  balances identical to the v1 app; rollback restores a working v1 app. ✅
- Mumbai project with a copy of the real data: 1 group, 6 members, 1 trip,
  31 expenses; owner linked; all 6 balances identical to the live app. ✅
- The rehearsal found and fixed a rollback bug (migration 0900). ✅

## Before the day (your tasks)
- [ ] **Google: publish the consent screen.** Google Cloud → Google Auth Platform →
      Audience → **Publish app** (In production). While in "Testing", only listed
      test users can sign in with Google. Basic scopes (email, profile) need no review.
- [ ] **Replace the Google client secret** (it was shared in chat): add a new secret,
      paste it into Supabase → Google provider, disable the old one, delete the JSON.
- [ ] **Rename the project** in the Supabase dashboard from "splitpro-staging" to
      "splitpro" (cosmetic; the ref and keys don't change).
- [ ] **Pick a time** and tell the group: "SplitPro moves to a new version at <time>,
      down ~15 min. Please don't add expenses during that time. Afterwards, open the
      invite link I send, sign in with Google, and tap your own name."
- [ ] Friends must use **Google** sign-in for now: email sign-in only reaches members
      of your Supabase organisation until a custom email provider (Resend) is set up.

## On the day (Claude runs these; you approve each change to production)
1. **Freeze**: confirm the group has stopped adding expenses.
2. **Fresh backup of Tokyo (read-only)** into `backups/live-<date>/`:
   ```bash
   npx supabase db query --remote=uardivkwulfjwgmwmsqn --read-only \
     "select coalesce(json_agg(t order by created_at),'[]') j from public.expenses t"
   ```
   (and groups, members, trips). Compare counts with the v1 app.
3. **Re-run the rehearsal** on the fresh backup: `npm test` (the real-data rehearsal
   test reads `backups/live-*`). Must pass.
4. **Owner account**: you sign in with Google on the Mumbai project (preview link) so
   your account exists. (Already true from testing.)
5. **Production auth settings** on Mumbai via `npx supabase config push` (diff first):
   - `site_url` = `https://supersplit.netlify.app`
   - `enable_anonymous_sign_ins` = **false** (it is true for staging testing)
   - redirect URLs keep localhost and previews for development.
6. **Import**:
   ```bash
   node scripts/golive-import.mjs backups/live-<date> "Rajas"
   npx supabase db query --remote --yes -f backups/live-<date>/golive-import.sql
   ```
   One transaction: clears rehearsal data, loads the backup into `legacy_*`, imports,
   and aborts unless all expenses arrived.
7. **Verify** balances as the owner match the v1 app to the paisa
   (`backups/live-*/check-balances.sql` pattern), and run
   `supabase/tests/staging-smoke.sql` (rolled back) and `db advisors`.
8. **Publish the v2 app**: merge the Phase 2 and Phase 3 PRs into `main`. Netlify
   builds with the production context (Mumbai, no staging labels).
9. **Check the live site**, then **invite everyone**: create the invite link in the
   app and send it; each friend claims their name.

## Rollback
- **Before step 8** (app not switched yet): nothing to undo for users; the v1 app
  still talks to Tokyo, which was never modified.
- **After step 8**: Netlify → Deploys → the last v1 deploy (`main@b006f06`, the
  Phase 1 release) → **Publish deploy**. Users are back on v1 + Tokyo instantly.
  Anything entered in v2 meanwhile would need re-entering in v1.

## After go-live
- **+1 week**, if all is well: pause the Tokyo project (Dashboard → Project settings →
  Pause). Paused projects can be restored for 90 days.
- Create a new **staging** project (Mumbai) in the freed slot, `db push` the
  migrations, and point the deploy-preview and branch-deploy contexts in
  `netlify.toml` and `.env.development` at it. Until then previews use production.
- **+30 days**: drop the `legacy_*` tables on Mumbai.
- Before inviting beyond the friend group: custom email (Resend + your domain) and
  the Supabase Pro plan (daily backups, no pausing after 7 idle days).

---

## Appendix: in-place path (Tokyo), kept for reference
Rename the v1 tables to `legacy_*` in Tokyo, `db push` all migrations, run
`private.import_legacy(<owner>, 'Rajas')`. Rollback: rename v2 tables to
`v2_failed_*` and the `legacy_*` tables back. Both directions are covered by
`supabase/tests/switchover-rehearsal.test.ts`, including migration 0900 which
keeps the Phase 0 passcode check working after a rollback.
