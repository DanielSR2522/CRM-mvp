-- =====================================================================================
-- Migration: 20261006173000_convert_health_policies_active_to_enrolled.sql
-- Description: Convert existing health_policies rows where policy_status = 'Active'
--              to active = true and policy_status = 'Enrolled'.
--              Non-target rows (Pending, Cancelled, Sold, Enrolled, null) remain untouched.
-- =====================================================================================

BEGIN;

-- Convert legacy 'Active' policy_status to 'Enrolled' and ensure active boolean is true
UPDATE public.health_policies
SET
  active = true,
  policy_status = 'Enrolled',
  updated_at = NOW()
WHERE policy_status = 'Active';

COMMIT;

NOTIFY pgrst, 'reload schema';

-- =====================================================================================
-- ROLLBACK SQL (Applicable if needed using rollback snapshot):
-- =====================================================================================
-- BEGIN;
-- UPDATE public.health_policies
-- SET policy_status = 'Active'
-- WHERE id IN (<SNAPSHOT_IDS>);
-- COMMIT;
-- NOTIFY pgrst, 'reload schema';
-- =====================================================================================
