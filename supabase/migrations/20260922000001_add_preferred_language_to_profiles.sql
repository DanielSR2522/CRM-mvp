-- Migration: Add preferred_language column to public.profiles
-- Canonical supported values: 'es', 'en', 'pt' (default: 'es')

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS preferred_language TEXT NOT NULL DEFAULT 'es';

-- Add check constraint ensuring only valid language codes are allowed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_preferred_language_check'
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_preferred_language_check
    CHECK (preferred_language IN ('es', 'en', 'pt'));
  END IF;
END $$;
