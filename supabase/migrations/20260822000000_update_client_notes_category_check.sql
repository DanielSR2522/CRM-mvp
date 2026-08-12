-- =====================================================================================
-- Migration: 20260822000000_update_client_notes_category_check.sql
-- Description: Update client_notes_category_check constraint to include 'medicare' and 'supplemental'.
-- =====================================================================================

ALTER TABLE public.client_notes
  DROP CONSTRAINT IF EXISTS client_notes_category_check;

ALTER TABLE public.client_notes
  ADD CONSTRAINT client_notes_category_check
  CHECK (category IN ('health', 'life', 'property_casualty', 'medicare', 'supplemental'));

NOTIFY pgrst, 'reload schema';
