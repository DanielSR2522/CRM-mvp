-- =====================================================================================
-- Migration: 20260820000000_add_beneficiary_to_supplemental_policies.sql
-- Description: Additive migration adding Beneficiary Information fields to client_supplemental_policies.
-- =====================================================================================

ALTER TABLE public.client_supplemental_policies
  ADD COLUMN IF NOT EXISTS beneficiary_name TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS beneficiary_phone TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS beneficiary_birth_date DATE DEFAULT NULL;

NOTIFY pgrst, 'reload schema';
