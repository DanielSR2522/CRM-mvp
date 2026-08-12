-- Migration: 20260816000000_add_policy_lifecycle_fields.sql
-- Description: Adds lifecycle fields for P&C policy renewal lineage and cancellation tracking

ALTER TABLE public.policies
  ADD COLUMN IF NOT EXISTS renewed_from_policy_id UUID REFERENCES public.policies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT NULL;

CREATE INDEX IF NOT EXISTS policies_renewed_from_idx ON public.policies(renewed_from_policy_id);
