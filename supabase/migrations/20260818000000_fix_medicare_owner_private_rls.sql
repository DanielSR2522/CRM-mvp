-- =====================================================================================
-- Migration: 20260818000000_fix_medicare_owner_private_rls.sql
-- Description: Enforces STRICT OWNER-PRIVATE RLS policies on all 8 Medicare tables.
--              Shared access (e.g. Amanda/Laura P&C sharing) is completely blocked.
-- =====================================================================================

-- 1. client_medicare_information
ALTER TABLE public.client_medicare_information ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agents select medicare info of accessible clients" ON public.client_medicare_information;
DROP POLICY IF EXISTS "Agents insert medicare info for accessible clients" ON public.client_medicare_information;
DROP POLICY IF EXISTS "Agents update medicare info of accessible clients" ON public.client_medicare_information;
DROP POLICY IF EXISTS "Agents delete medicare info of accessible clients" ON public.client_medicare_information;
DROP POLICY IF EXISTS "Medicare info owner only select" ON public.client_medicare_information;
DROP POLICY IF EXISTS "Medicare info owner only insert" ON public.client_medicare_information;
DROP POLICY IF EXISTS "Medicare info owner only update" ON public.client_medicare_information;
DROP POLICY IF EXISTS "Medicare info owner only delete" ON public.client_medicare_information;

CREATE POLICY "Medicare info owner only select" ON public.client_medicare_information
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.agent_id = auth.uid()));

CREATE POLICY "Medicare info owner only insert" ON public.client_medicare_information
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.agent_id = auth.uid()));

CREATE POLICY "Medicare info owner only update" ON public.client_medicare_information
    FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.agent_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.agent_id = auth.uid()));

CREATE POLICY "Medicare info owner only delete" ON public.client_medicare_information
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.agent_id = auth.uid()));


-- 2. client_medicare_doctors
ALTER TABLE public.client_medicare_doctors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Agents manage medicare doctors" ON public.client_medicare_doctors;
DROP POLICY IF EXISTS "Medicare doctors owner only" ON public.client_medicare_doctors;

CREATE POLICY "Medicare doctors owner only" ON public.client_medicare_doctors
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.agent_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.agent_id = auth.uid()));


-- 3. client_medicare_hospitals
ALTER TABLE public.client_medicare_hospitals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Agents manage medicare hospitals" ON public.client_medicare_hospitals;
DROP POLICY IF EXISTS "Medicare hospitals owner only" ON public.client_medicare_hospitals;

CREATE POLICY "Medicare hospitals owner only" ON public.client_medicare_hospitals
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.agent_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.agent_id = auth.uid()));


-- 4. client_medicare_urgent_cares
ALTER TABLE public.client_medicare_urgent_cares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Agents manage medicare urgent cares" ON public.client_medicare_urgent_cares;
DROP POLICY IF EXISTS "Medicare urgent cares owner only" ON public.client_medicare_urgent_cares;

CREATE POLICY "Medicare urgent cares owner only" ON public.client_medicare_urgent_cares
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.agent_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.agent_id = auth.uid()));


-- 5. client_medicare_pharmacies
ALTER TABLE public.client_medicare_pharmacies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Agents manage medicare pharmacies" ON public.client_medicare_pharmacies;
DROP POLICY IF EXISTS "Medicare pharmacies owner only" ON public.client_medicare_pharmacies;

CREATE POLICY "Medicare pharmacies owner only" ON public.client_medicare_pharmacies
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.agent_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.agent_id = auth.uid()));


-- 6. client_medicare_conditions
ALTER TABLE public.client_medicare_conditions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Agents manage medicare conditions" ON public.client_medicare_conditions;
DROP POLICY IF EXISTS "Medicare conditions owner only" ON public.client_medicare_conditions;

CREATE POLICY "Medicare conditions owner only" ON public.client_medicare_conditions
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.agent_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.agent_id = auth.uid()));


-- 7. client_medicare_specialists
ALTER TABLE public.client_medicare_specialists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Agents manage medicare specialists" ON public.client_medicare_specialists;
DROP POLICY IF EXISTS "Medicare specialists owner only" ON public.client_medicare_specialists;

CREATE POLICY "Medicare specialists owner only" ON public.client_medicare_specialists
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.agent_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.agent_id = auth.uid()));


-- 8. client_medicare_medications
ALTER TABLE public.client_medicare_medications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Agents manage medicare medications" ON public.client_medicare_medications;
DROP POLICY IF EXISTS "Medicare medications owner only" ON public.client_medicare_medications;

CREATE POLICY "Medicare medications owner only" ON public.client_medicare_medications
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.agent_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.agent_id = auth.uid()));

NOTIFY pgrst, 'reload schema';
