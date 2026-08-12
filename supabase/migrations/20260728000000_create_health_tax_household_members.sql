-- =============================================
-- Migration: Create health_tax_household_members Table
-- Timestamp: 20260728_create_health_tax_household_members.sql
-- =============================================

CREATE TABLE IF NOT EXISTS public.health_tax_household_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_policy_id UUID NOT NULL REFERENCES public.health_policies(id) ON DELETE CASCADE,
  member_number INTEGER NOT NULL,
  coverage BOOLEAN NOT NULL DEFAULT TRUE,
  full_name TEXT NOT NULL,
  date_of_birth DATE,
  ssn_encrypted TEXT,
  relationship_to_applicant TEXT NOT NULL,
  immigration_status TEXT,
  immigration_card_number_encrypted TEXT,
  immigration_uscis_number_encrypted TEXT,
  immigration_category TEXT,
  immigration_expiration_date DATE,
  immigration_alien_number_encrypted TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT health_tax_household_members_policy_member_unique UNIQUE (health_policy_id, member_number),
  CONSTRAINT health_tax_household_members_member_number_min CHECK (member_number >= 2)
);

-- Index for fast lookup by health_policy_id
CREATE INDEX IF NOT EXISTS idx_health_tax_household_members_policy_id
  ON public.health_tax_household_members(health_policy_id);

-- Enable Row Level Security
ALTER TABLE public.health_tax_household_members ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DO $$
BEGIN
  -- SELECT POLICY
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'health_tax_household_members'
      AND policyname = 'Agents can select tax household members of their health policies'
  ) THEN
    CREATE POLICY "Agents can select tax household members of their health policies"
      ON public.health_tax_household_members
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.health_policies hp
          JOIN public.clients c ON c.id = hp.client_id
          WHERE hp.id = health_tax_household_members.health_policy_id
            AND c.agent_id = auth.uid()
        )
      );
  END IF;

  -- INSERT POLICY
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'health_tax_household_members'
      AND policyname = 'Agents can insert tax household members for their health policies'
  ) THEN
    CREATE POLICY "Agents can insert tax household members for their health policies"
      ON public.health_tax_household_members
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.health_policies hp
          JOIN public.clients c ON c.id = hp.client_id
          WHERE hp.id = health_tax_household_members.health_policy_id
            AND c.agent_id = auth.uid()
        )
      );
  END IF;

  -- UPDATE POLICY
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'health_tax_household_members'
      AND policyname = 'Agents can update tax household members of their health policies'
  ) THEN
    CREATE POLICY "Agents can update tax household members of their health policies"
      ON public.health_tax_household_members
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.health_policies hp
          JOIN public.clients c ON c.id = hp.client_id
          WHERE hp.id = health_tax_household_members.health_policy_id
            AND c.agent_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.health_policies hp
          JOIN public.clients c ON c.id = hp.client_id
          WHERE hp.id = health_tax_household_members.health_policy_id
            AND c.agent_id = auth.uid()
        )
      );
  END IF;

  -- DELETE POLICY
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'health_tax_household_members'
      AND policyname = 'Agents can delete tax household members of their health policies'
  ) THEN
    CREATE POLICY "Agents can delete tax household members of their health policies"
      ON public.health_tax_household_members
      FOR DELETE
      USING (
        EXISTS (
          SELECT 1 FROM public.health_policies hp
          JOIN public.clients c ON c.id = hp.client_id
          WHERE hp.id = health_tax_household_members.health_policy_id
            AND c.agent_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS health_tax_household_members_set_updated_at_trg ON public.health_tax_household_members;
CREATE TRIGGER health_tax_household_members_set_updated_at_trg
BEFORE UPDATE ON public.health_tax_household_members
FOR EACH ROW
EXECUTE FUNCTION public.health_set_updated_at();
