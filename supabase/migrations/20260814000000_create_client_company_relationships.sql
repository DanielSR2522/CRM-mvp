-- =====================================================================================
-- SmarTrack CRM — Company Client Architecture & EIN Migration
-- File: supabase/migrations/20260814000000_create_client_company_relationships.sql
-- =====================================================================================

-- 1. ADD EIN COLUMN TO PUBLIC.CLIENTS
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS ein TEXT;

-- 2. CREATE CLIENT_COMPANY_RELATIONSHIPS JUNCTION TABLE
CREATE TABLE IF NOT EXISTS public.client_company_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    personal_client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    relationship_type TEXT DEFAULT 'contact_person',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT client_company_relationships_unique UNIQUE (company_client_id, personal_client_id)
);

-- Indexes for high performance
CREATE INDEX IF NOT EXISTS idx_client_company_rel_company ON public.client_company_relationships(company_client_id);
CREATE INDEX IF NOT EXISTS idx_client_company_rel_personal ON public.client_company_relationships(personal_client_id);

-- Enable RLS
ALTER TABLE public.client_company_relationships ENABLE ROW LEVEL SECURITY;

-- Drop legacy policies if any
DROP POLICY IF EXISTS "Agents select client_company_relationships" ON public.client_company_relationships;
DROP POLICY IF EXISTS "Agents insert client_company_relationships" ON public.client_company_relationships;
DROP POLICY IF EXISTS "Agents update client_company_relationships" ON public.client_company_relationships;
DROP POLICY IF EXISTS "Agents delete client_company_relationships" ON public.client_company_relationships;

-- SELECT policy: Agents can view relationships if they have access to either the company client or personal client
CREATE POLICY "Agents select client_company_relationships"
ON public.client_company_relationships FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.clients c
        WHERE (c.id = company_client_id OR c.id = personal_client_id)
        AND (
            c.agent_id = auth.uid()
            OR can_access_agent(c.agent_id, 'property_casualty')
        )
    )
);

-- INSERT policy: Agents can insert relationships for accessible clients
CREATE POLICY "Agents insert client_company_relationships"
ON public.client_company_relationships FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.clients comp
        WHERE comp.id = company_client_id
        AND (
            comp.agent_id = auth.uid()
            OR can_access_agent(comp.agent_id, 'property_casualty')
        )
    )
    AND EXISTS (
        SELECT 1 FROM public.clients pers
        WHERE pers.id = personal_client_id
        AND (
            pers.agent_id = auth.uid()
            OR can_access_agent(pers.agent_id, 'property_casualty')
        )
    )
);

-- DELETE policy: Agents can delete relationships for accessible clients
CREATE POLICY "Agents delete client_company_relationships"
ON public.client_company_relationships FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.clients c
        WHERE (c.id = company_client_id OR c.id = personal_client_id)
        AND (
            c.agent_id = auth.uid()
            OR can_access_agent(c.agent_id, 'property_casualty')
        )
    )
);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

