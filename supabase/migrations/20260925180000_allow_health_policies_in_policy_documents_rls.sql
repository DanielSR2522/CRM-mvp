-- =====================================================================================
-- Migration: 20260925180000_allow_health_policies_in_policy_documents_rls.sql
-- Description: Allow Health policies (in health_policies table) to pass RLS on
--              policy_documents and policy_document_sections alongside P&C policies.
-- =====================================================================================

-- 1. RLS FOR POLICY DOCUMENT SECTIONS (P&C + HEALTH)
ALTER TABLE public.policy_document_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agents can select sections of their policies" ON public.policy_document_sections;
DROP POLICY IF EXISTS "Policy document sections select policy" ON public.policy_document_sections;
CREATE POLICY "Policy document sections select policy"
    ON public.policy_document_sections FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.policies p
            JOIN public.clients c ON c.id = p.client_id
            WHERE p.id = policy_document_sections.policy_id
            AND (
                c.agent_id = auth.uid()
                OR can_access_agent(c.agent_id, 'property_casualty')
            )
        )
        OR
        EXISTS (
            SELECT 1 FROM public.health_policies hp
            JOIN public.clients c ON c.id = hp.client_id
            WHERE hp.id = policy_document_sections.policy_id
            AND c.agent_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Agents can insert sections for their policies" ON public.policy_document_sections;
DROP POLICY IF EXISTS "Policy document sections insert policy" ON public.policy_document_sections;
CREATE POLICY "Policy document sections insert policy"
    ON public.policy_document_sections FOR INSERT
    TO authenticated
    WITH CHECK (
        created_by = auth.uid()
        AND (
            EXISTS (
                SELECT 1 FROM public.policies p
                JOIN public.clients c ON c.id = p.client_id
                WHERE p.id = policy_document_sections.policy_id
                AND (
                    c.agent_id = auth.uid()
                    OR can_access_agent(c.agent_id, 'property_casualty')
                )
            )
            OR
            EXISTS (
                SELECT 1 FROM public.health_policies hp
                JOIN public.clients c ON c.id = hp.client_id
                WHERE hp.id = policy_document_sections.policy_id
                AND c.agent_id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "Agents can update sections of their policies" ON public.policy_document_sections;
DROP POLICY IF EXISTS "Policy document sections update policy" ON public.policy_document_sections;
CREATE POLICY "Policy document sections update policy"
    ON public.policy_document_sections FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.policies p
            JOIN public.clients c ON c.id = p.client_id
            WHERE p.id = policy_document_sections.policy_id
            AND (
                c.agent_id = auth.uid()
                OR can_access_agent(c.agent_id, 'property_casualty')
            )
        )
        OR
        EXISTS (
            SELECT 1 FROM public.health_policies hp
            JOIN public.clients c ON c.id = hp.client_id
            WHERE hp.id = policy_document_sections.policy_id
            AND c.agent_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.policies p
            JOIN public.clients c ON c.id = p.client_id
            WHERE p.id = policy_document_sections.policy_id
            AND (
                c.agent_id = auth.uid()
                OR can_access_agent(c.agent_id, 'property_casualty')
            )
        )
        OR
        EXISTS (
            SELECT 1 FROM public.health_policies hp
            JOIN public.clients c ON c.id = hp.client_id
            WHERE hp.id = policy_document_sections.policy_id
            AND c.agent_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Agents can delete sections of their policies" ON public.policy_document_sections;
DROP POLICY IF EXISTS "Policy document sections delete policy" ON public.policy_document_sections;
CREATE POLICY "Policy document sections delete policy"
    ON public.policy_document_sections FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.policies p
            JOIN public.clients c ON c.id = p.client_id
            WHERE p.id = policy_document_sections.policy_id
            AND (
                c.agent_id = auth.uid()
                OR can_access_agent(c.agent_id, 'property_casualty')
            )
        )
        OR
        EXISTS (
            SELECT 1 FROM public.health_policies hp
            JOIN public.clients c ON c.id = hp.client_id
            WHERE hp.id = policy_document_sections.policy_id
            AND c.agent_id = auth.uid()
        )
    );

-- 2. RLS FOR POLICY DOCUMENTS (P&C + HEALTH)
ALTER TABLE public.policy_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agents can select documents of their policies" ON public.policy_documents;
DROP POLICY IF EXISTS "Policy documents select policy" ON public.policy_documents;
CREATE POLICY "Policy documents select policy"
    ON public.policy_documents FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.policies p
            JOIN public.clients c ON c.id = p.client_id
            WHERE p.id = policy_documents.policy_id
            AND (
                c.agent_id = auth.uid()
                OR can_access_agent(c.agent_id, 'property_casualty')
            )
        )
        OR
        EXISTS (
            SELECT 1 FROM public.health_policies hp
            JOIN public.clients c ON c.id = hp.client_id
            WHERE hp.id = policy_documents.policy_id
            AND c.agent_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Agents can insert documents for their policies" ON public.policy_documents;
DROP POLICY IF EXISTS "Policy documents insert policy" ON public.policy_documents;
CREATE POLICY "Policy documents insert policy"
    ON public.policy_documents FOR INSERT
    TO authenticated
    WITH CHECK (
        uploaded_by = auth.uid()
        AND (
            EXISTS (
                SELECT 1 FROM public.policies p
                JOIN public.clients c ON c.id = p.client_id
                WHERE p.id = policy_documents.policy_id
                AND (
                    c.agent_id = auth.uid()
                    OR can_access_agent(c.agent_id, 'property_casualty')
                )
            )
            OR
            EXISTS (
                SELECT 1 FROM public.health_policies hp
                JOIN public.clients c ON c.id = hp.client_id
                WHERE hp.id = policy_documents.policy_id
                AND c.agent_id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "Agents can update documents of their policies" ON public.policy_documents;
DROP POLICY IF EXISTS "Policy documents update policy" ON public.policy_documents;
CREATE POLICY "Policy documents update policy"
    ON public.policy_documents FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.policies p
            JOIN public.clients c ON c.id = p.client_id
            WHERE p.id = policy_documents.policy_id
            AND (
                c.agent_id = auth.uid()
                OR can_access_agent(c.agent_id, 'property_casualty')
            )
        )
        OR
        EXISTS (
            SELECT 1 FROM public.health_policies hp
            JOIN public.clients c ON c.id = hp.client_id
            WHERE hp.id = policy_documents.policy_id
            AND c.agent_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.policies p
            JOIN public.clients c ON c.id = p.client_id
            WHERE p.id = policy_documents.policy_id
            AND (
                c.agent_id = auth.uid()
                OR can_access_agent(c.agent_id, 'property_casualty')
            )
        )
        OR
        EXISTS (
            SELECT 1 FROM public.health_policies hp
            JOIN public.clients c ON c.id = hp.client_id
            WHERE hp.id = policy_documents.policy_id
            AND c.agent_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Agents can delete documents of their policies" ON public.policy_documents;
DROP POLICY IF EXISTS "Policy documents delete policy" ON public.policy_documents;
CREATE POLICY "Policy documents delete policy"
    ON public.policy_documents FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.policies p
            JOIN public.clients c ON c.id = p.client_id
            WHERE p.id = policy_documents.policy_id
            AND (
                c.agent_id = auth.uid()
                OR can_access_agent(c.agent_id, 'property_casualty')
            )
        )
        OR
        EXISTS (
            SELECT 1 FROM public.health_policies hp
            JOIN public.clients c ON c.id = hp.client_id
            WHERE hp.id = policy_documents.policy_id
            AND c.agent_id = auth.uid()
        )
    );

NOTIFY pgrst, 'reload schema';
