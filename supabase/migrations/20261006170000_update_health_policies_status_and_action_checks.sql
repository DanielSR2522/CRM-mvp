-- =====================================================================================
-- Migration: 20261006170000_update_health_policies_status_and_action_checks.sql
-- Description: Update health_policies check constraints to support 'Sold' and 'Enrolled'
--              in policy_status, and 'Payment' and 'Enroll' in action_pending, while
--              preserving existing values including legacy 'Active' for policy_status.
-- =====================================================================================

BEGIN;

-- 1. Update policy_status check constraint
ALTER TABLE public.health_policies
  DROP CONSTRAINT IF EXISTS health_policies_policy_status_check;

ALTER TABLE public.health_policies
  ADD CONSTRAINT health_policies_policy_status_check
  CHECK (policy_status IN ('Active', 'Pending', 'Cancelled', 'Sold', 'Enrolled'));

-- 2. Update action_pending check constraint
ALTER TABLE public.health_policies
  DROP CONSTRAINT IF EXISTS health_policies_action_pending_check;

ALTER TABLE public.health_policies
  ADD CONSTRAINT health_policies_action_pending_check
  CHECK (action_pending IN (
    'Documents', 'Verification', 'Call To Marketplace',
    'Completed', 'Payment', 'Enroll'
  ));

COMMIT;

NOTIFY pgrst, 'reload schema';

-- =====================================================================================
-- ROLLBACK SQL:
-- =====================================================================================
-- BEGIN;
-- ALTER TABLE public.health_policies DROP CONSTRAINT IF EXISTS health_policies_policy_status_check;
-- ALTER TABLE public.health_policies ADD CONSTRAINT health_policies_policy_status_check CHECK (policy_status IN ('Active', 'Pending', 'Cancelled'));
-- ALTER TABLE public.health_policies DROP CONSTRAINT IF EXISTS health_policies_action_pending_check;
-- ALTER TABLE public.health_policies ADD CONSTRAINT health_policies_action_pending_check CHECK (action_pending IN ('Documents', 'Verification', 'Call To Marketplace', 'Completed'));
-- COMMIT;
-- NOTIFY pgrst, 'reload schema';
-- =====================================================================================
