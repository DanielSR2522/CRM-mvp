-- Migration: Add explicit client_type to clients table and create personal_policy_companies junction table
-- 1. Add client_type column to public.clients
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS client_type TEXT NOT NULL DEFAULT 'personal';

-- Add check constraint for valid client_type values
ALTER TABLE public.clients
DROP CONSTRAINT IF EXISTS chk_clients_client_type;

ALTER TABLE public.clients
ADD CONSTRAINT chk_clients_client_type CHECK (client_type IN ('personal', 'company'));

-- Index client_type for fast query performance
CREATE INDEX IF NOT EXISTS idx_clients_client_type ON public.clients(client_type);

-- 2. Backfill existing Company clients based on authoritative policy_ownership_type signal
UPDATE public.clients
SET client_type = 'company'
WHERE id IN (
    SELECT client_id FROM public.policies WHERE policy_ownership_type = 'company'
);

-- 3. Create personal_policy_companies table for linking multiple companies to personal policies
CREATE TABLE IF NOT EXISTS public.personal_policy_companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id UUID NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
    company_client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT personal_policy_companies_unique UNIQUE(policy_id, company_client_id)
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_personal_policy_companies_policy_id ON public.personal_policy_companies(policy_id);
CREATE INDEX IF NOT EXISTS idx_personal_policy_companies_company_client_id ON public.personal_policy_companies(company_client_id);

-- Enable Row Level Security
ALTER TABLE public.personal_policy_companies ENABLE ROW LEVEL SECURITY;

-- SELECT policy: Authorized if authenticated agent owns the underlying Personal P&C policy via clients.agent_id or has explicit P&C scoped shared access
DROP POLICY IF EXISTS "Agents select personal_policy_companies" ON public.personal_policy_companies;
CREATE POLICY "Agents select personal_policy_companies"
    ON public.personal_policy_companies FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.policies p
            JOIN public.clients owner_client ON owner_client.id = p.client_id
            WHERE p.id = personal_policy_companies.policy_id
            AND p.policy_ownership_type = 'personal'
            AND (
                owner_client.agent_id = auth.uid()
                OR public.can_access_agent(owner_client.agent_id, 'property_casualty')
            )
        )
    );

-- INSERT policy: Must be created_by auth.uid(), target policy must be personal (resolving owner agent through clients), and company_client_id must have client_type = 'company'
DROP POLICY IF EXISTS "Agents insert personal_policy_companies" ON public.personal_policy_companies;
CREATE POLICY "Agents insert personal_policy_companies"
    ON public.personal_policy_companies FOR INSERT
    TO authenticated
    WITH CHECK (
        created_by = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.policies p
            JOIN public.clients owner_client ON owner_client.id = p.client_id
            WHERE p.id = personal_policy_companies.policy_id
            AND p.policy_ownership_type = 'personal'
            AND (
                owner_client.agent_id = auth.uid()
                OR public.can_access_agent(owner_client.agent_id, 'property_casualty')
            )
        )
        AND EXISTS (
            SELECT 1 FROM public.clients company_client
            WHERE company_client.id = personal_policy_companies.company_client_id
            AND company_client.client_type = 'company'
        )
    );

-- DELETE policy: Authorized policy owner or P&C shared access agent only (resolving owner agent through clients)
DROP POLICY IF EXISTS "Agents delete personal_policy_companies" ON public.personal_policy_companies;
CREATE POLICY "Agents delete personal_policy_companies"
    ON public.personal_policy_companies FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.policies p
            JOIN public.clients owner_client ON owner_client.id = p.client_id
            WHERE p.id = personal_policy_companies.policy_id
            AND p.policy_ownership_type = 'personal'
            AND (
                owner_client.agent_id = auth.uid()
                OR public.can_access_agent(owner_client.agent_id, 'property_casualty')
            )
        )
    );
