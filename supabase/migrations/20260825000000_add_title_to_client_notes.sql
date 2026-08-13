-- =====================================================================================
-- Migration: 20260825000000_add_title_to_client_notes.sql
-- Description: Add optional title column to public.client_notes table.
-- =====================================================================================

ALTER TABLE public.client_notes
ADD COLUMN IF NOT EXISTS title text;

NOTIFY pgrst, 'reload schema';
