-- ============================================================
-- SplitPro v2: keep the Phase 0 passcode check working during the switch-over.
--
-- Found by the switch-over rehearsal (supabase/tests/switchover-rehearsal.test.ts):
-- migration 0300 revokes EXECUTE on every function in schema `private`, which
-- includes the Phase 0 function private.has_access(). The v1 tables' policies
-- call it, so after 0300 the v1 app (and a ROLLBACK to v1) would fail with
-- "permission denied for function has_access".
--
-- Restore exactly what Phase 0 granted, only where Phase 0 exists (the live
-- project; staging never had it). Removed together with the legacy tables
-- 30 days after the switch-over (see SWITCHOVER.md).
-- ============================================================
do $$
begin
  if to_regprocedure('private.has_access()') is not null then
    grant execute on function private.has_access() to anon, authenticated;
  end if;
end;
$$;
