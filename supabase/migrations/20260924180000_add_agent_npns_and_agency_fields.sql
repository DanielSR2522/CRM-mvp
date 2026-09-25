-- Migration: Add Agency License, Agency NPN, and Tax ID/EIN to profiles, and create agent_npns table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS agency_license_number TEXT,
  ADD COLUMN IF NOT EXISTS agency_npn TEXT,
  ADD COLUMN IF NOT EXISTS tax_id TEXT;

-- Create agent_npns table
CREATE TABLE IF NOT EXISTS public.agent_npns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  npn TEXT NOT NULL,
  display_name TEXT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT agent_npns_agent_id_npn_key UNIQUE (agent_id, npn)
);

-- Enable RLS
ALTER TABLE public.agent_npns ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Authenticated users can select all active agent_npns or manage their own
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'agent_npns' AND policyname = 'agent_npns_all_access'
  ) THEN
    CREATE POLICY agent_npns_all_access ON public.agent_npns
      FOR ALL TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Backfill existing profiles.npn_number into agent_npns as default
INSERT INTO public.agent_npns (agent_id, npn, display_name, is_default, active)
SELECT
  id AS agent_id,
  npn_number AS npn,
  COALESCE(
    NULLIF(TRIM(CONCAT(first_name, ' ', last_name)), ''),
    NULLIF(name, ''),
    'Default NPN'
  ) AS display_name,
  true AS is_default,
  true AS active
FROM public.profiles
WHERE npn_number IS NOT NULL AND TRIM(npn_number) != ''
ON CONFLICT (agent_id, npn) DO UPDATE SET is_default = true;
