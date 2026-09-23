-- Migration: 20260922000000_create_agent_assistant_relationships.sql
-- Description: Creates profiles.role, agent_assistant_relationships table, RLS policies, and concurrency-safe MAX-4 enforcement trigger.

-- 1. Add canonical 'role' column to public.profiles if not exists
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'agent';

-- 2. Populate canonical roles based on approved identity audit
UPDATE public.profiles SET role = 'admin' WHERE id IN (
  '78fab56d-c5f0-4658-aed8-fef2a25710e2', -- Amanda Perez
  'b8c07e53-9f4e-4093-9959-d7d062d4d89f'  -- Laura Merlo
);

UPDATE public.profiles SET role = 'agent' WHERE id IN (
  '5a844343-d2ae-4864-b317-32b196a5c905', -- Daniel Rodriguez
  'ae5bb831-80f5-4d11-801b-32371798f478', -- Decire Verdecia Insurance
  '50e6798f-f449-4e49-be57-c38f5bc3f225', -- Adolfo Hitler (pruebas@smartrack.com)
  'f868357a-68c2-448e-ae5f-831aed6b1bc1', -- Damaris Villafane-Galarza
  '24a1e7c8-9def-4075-a45e-af7b9b2633a3', -- Yolanda Restrepo
  'd1c696ef-c77d-4b2b-a3f5-83acd965c363'  -- Loni Oliveira De Souza
);

-- 3. Create agent_assistant_relationships table
CREATE TABLE IF NOT EXISTS public.agent_assistant_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assistant_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT unique_agent_assistant UNIQUE (agent_profile_id, assistant_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_assistant_agent ON public.agent_assistant_relationships(agent_profile_id);
CREATE INDEX IF NOT EXISTS idx_agent_assistant_assistant ON public.agent_assistant_relationships(assistant_profile_id);

-- 4. Enable RLS on agent_assistant_relationships
ALTER TABLE public.agent_assistant_relationships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read for authenticated users" ON public.agent_assistant_relationships;
CREATE POLICY "Allow read for authenticated users"
  ON public.agent_assistant_relationships
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow admin and assigned agent to manage relationships" ON public.agent_assistant_relationships;
CREATE POLICY "Allow admin and assigned agent to manage relationships"
  ON public.agent_assistant_relationships
  FOR ALL
  TO authenticated
  USING (
    agent_profile_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    agent_profile_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- 5. Concurrency-Safe MAX-4 Enforcement Trigger via Parent Row Lock (FOR UPDATE)
CREATE OR REPLACE FUNCTION check_max_assistants_per_agent()
RETURNS TRIGGER AS $$
DECLARE
  current_count INT;
BEGIN
  -- Acquire row lock on parent agent profile to serialize concurrent inserts for the same agent
  PERFORM 1 FROM public.profiles WHERE id = NEW.agent_profile_id FOR UPDATE;

  -- Count existing relationships after acquiring row lock
  SELECT count(*) INTO current_count 
  FROM public.agent_assistant_relationships 
  WHERE agent_profile_id = NEW.agent_profile_id;

  IF current_count >= 4 THEN
    RAISE EXCEPTION 'Has alcanzado el máximo de 4 asistentes permitidos.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_max_assistants_trigger ON public.agent_assistant_relationships;
CREATE TRIGGER enforce_max_assistants_trigger
  BEFORE INSERT ON public.agent_assistant_relationships
  FOR EACH ROW
  EXECUTE FUNCTION check_max_assistants_per_agent();
