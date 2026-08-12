-- =====================================================================================
-- Migration: 20260819000000_create_supplemental_module.sql
-- Description: Additive migration for Supplemental Policies and Covered Members.
--              Enforces STRICT OWNER-PRIVATE RLS policies.
-- =====================================================================================

-- 1. Create client_supplemental_policies table (1 client -> many policies)
CREATE TABLE IF NOT EXISTS public.client_supplemental_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    product_type TEXT NOT NULL,
    company TEXT,
    plan_name TEXT,
    coverage_type TEXT,
    member_id TEXT,
    monthly_premium NUMERIC(10, 2) DEFAULT 0.00,
    effective_date DATE,
    status TEXT DEFAULT 'Active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create client_supplemental_members table (1 policy -> many members)
CREATE TABLE IF NOT EXISTS public.client_supplemental_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id UUID NOT NULL REFERENCES public.client_supplemental_policies(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    relationship TEXT DEFAULT 'Self',
    phone TEXT,
    birth_date DATE,
    member_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create Performance Indexes
CREATE INDEX IF NOT EXISTS idx_supplemental_policies_client_id ON public.client_supplemental_policies(client_id);
CREATE INDEX IF NOT EXISTS idx_supplemental_members_policy_id ON public.client_supplemental_members(policy_id);

-- 4. Enable Row Level Security (RLS) - OWNER PRIVATE ONLY
ALTER TABLE public.client_supplemental_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_supplemental_members ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for client_supplemental_policies (Owner-Only)
DROP POLICY IF EXISTS "Supplemental policies owner only select" ON public.client_supplemental_policies;
DROP POLICY IF EXISTS "Supplemental policies owner only insert" ON public.client_supplemental_policies;
DROP POLICY IF EXISTS "Supplemental policies owner only update" ON public.client_supplemental_policies;
DROP POLICY IF EXISTS "Supplemental policies owner only delete" ON public.client_supplemental_policies;

CREATE POLICY "Supplemental policies owner only select" ON public.client_supplemental_policies
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.agent_id = auth.uid()));

CREATE POLICY "Supplemental policies owner only insert" ON public.client_supplemental_policies
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.agent_id = auth.uid()));

CREATE POLICY "Supplemental policies owner only update" ON public.client_supplemental_policies
    FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.agent_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.agent_id = auth.uid()));

CREATE POLICY "Supplemental policies owner only delete" ON public.client_supplemental_policies
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.agent_id = auth.uid()));

-- 6. RLS Policies for client_supplemental_members (Owner-Only via policy_id -> client_id -> agent_id)
DROP POLICY IF EXISTS "Supplemental members owner only select" ON public.client_supplemental_members;
DROP POLICY IF EXISTS "Supplemental members owner only insert" ON public.client_supplemental_members;
DROP POLICY IF EXISTS "Supplemental members owner only update" ON public.client_supplemental_members;
DROP POLICY IF EXISTS "Supplemental members owner only delete" ON public.client_supplemental_members;

CREATE POLICY "Supplemental members owner only select" ON public.client_supplemental_members
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.client_supplemental_policies p
        JOIN public.clients c ON c.id = p.client_id
        WHERE p.id = policy_id AND c.agent_id = auth.uid()
    ));

CREATE POLICY "Supplemental members owner only insert" ON public.client_supplemental_members
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.client_supplemental_policies p
        JOIN public.clients c ON c.id = p.client_id
        WHERE p.id = policy_id AND c.agent_id = auth.uid()
    ));

CREATE POLICY "Supplemental members owner only update" ON public.client_supplemental_members
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.client_supplemental_policies p
        JOIN public.clients c ON c.id = p.client_id
        WHERE p.id = policy_id AND c.agent_id = auth.uid()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.client_supplemental_policies p
        JOIN public.clients c ON c.id = p.client_id
        WHERE p.id = policy_id AND c.agent_id = auth.uid()
    ));

CREATE POLICY "Supplemental members owner only delete" ON public.client_supplemental_members
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.client_supplemental_policies p
        JOIN public.clients c ON c.id = p.client_id
        WHERE p.id = policy_id AND c.agent_id = auth.uid()
    ));

NOTIFY pgrst, 'reload schema';
