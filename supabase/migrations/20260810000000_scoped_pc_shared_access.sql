-- =====================================================================================
-- Migration: 20260810000000_scoped_pc_shared_access.sql
-- Description: Enforces scoped Property & Casualty (P&C) shared access between Amanda Perez and Laura Merlo.
--              Health and Life policies/notes/data remain 100% owner-private across ALL operations.
--              Leads, Calendar, Consents, Signatures remain owner-private.
-- =====================================================================================

-- 1. Ensure scope column exists on agent_shared_access
ALTER TABLE public.agent_shared_access 
ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'property_casualty';

-- 2. Insert bidirectional P&C shared access between Amanda Perez and Laura Merlo
-- Amanda: 78fab56d-c5f0-4658-aed8-fef2a25710e2
-- Laura:  b8c07e53-9f4e-4093-9959-d7d062d4d89f
INSERT INTO public.agent_shared_access (agent_id, shared_agent_id, scope)
VALUES 
    ('78fab56d-c5f0-4658-aed8-fef2a25710e2', 'b8c07e53-9f4e-4093-9959-d7d062d4d89f', 'property_casualty'),
    ('b8c07e53-9f4e-4093-9959-d7d062d4d89f', '78fab56d-c5f0-4658-aed8-fef2a25710e2', 'property_casualty')
ON CONFLICT (agent_id, shared_agent_id) 
DO UPDATE SET scope = 'property_casualty';

-- 3. Update security helper function with scope parameter
CREATE OR REPLACE FUNCTION public.can_access_agent(target_agent_id UUID, req_scope TEXT DEFAULT 'property_casualty')
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NULL OR target_agent_id IS NULL THEN
        RETURN FALSE;
    END IF;

    IF target_agent_id = auth.uid() THEN
        RETURN TRUE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.agent_shared_access
        WHERE ((agent_id = auth.uid() AND shared_agent_id = target_agent_id)
           OR (shared_agent_id = auth.uid() AND agent_id = target_agent_id))
          AND (scope = req_scope OR scope = 'all')
    );
END;
$$;

-- 3b. Helper function to check P&C policy existence without RLS recursion
CREATE OR REPLACE FUNCTION public.client_has_pc_policy(p_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.policies p
        WHERE p.client_id = p_client_id
    );
$$;

REVOKE ALL ON FUNCTION public.client_has_pc_policy(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_has_pc_policy(uuid) TO authenticated;

-- 4. RLS FOR CLIENTS (P&C Scoped - requires policy record for non-owner shared access)
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agents can view their own clients" ON public.clients;
DROP POLICY IF EXISTS "Agents view owned or shared PC clients" ON public.clients;
CREATE POLICY "Agents view owned or shared PC clients"
    ON public.clients FOR SELECT
    TO authenticated
    USING (
        agent_id = auth.uid()
        OR (
            can_access_agent(agent_id, 'property_casualty')
            AND public.client_has_pc_policy(id)
        )
    );

DROP POLICY IF EXISTS "Agents can update their own clients" ON public.clients;
DROP POLICY IF EXISTS "Agents update owned or shared PC clients" ON public.clients;
CREATE POLICY "Agents update owned or shared PC clients"
    ON public.clients FOR UPDATE
    TO authenticated
    USING (
        agent_id = auth.uid()
        OR (
            can_access_agent(agent_id, 'property_casualty')
            AND public.client_has_pc_policy(id)
        )
    )
    WITH CHECK (
        agent_id = auth.uid()
        OR (
            can_access_agent(agent_id, 'property_casualty')
            AND public.client_has_pc_policy(id)
        )
    );

-- 5. RLS FOR CLIENT PERSONAL / RESIDENCE / INCOME INFORMATION
ALTER TABLE public.client_personal_information ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Agents can manage personal info of their clients" ON public.client_personal_information;
CREATE POLICY "Agents can manage personal info of their clients"
    ON public.client_personal_information FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = client_id
            AND (
                c.agent_id = auth.uid()
                OR (
                    can_access_agent(c.agent_id, 'property_casualty')
                    AND public.client_has_pc_policy(c.id)
                )
            )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = client_id
            AND (
                c.agent_id = auth.uid()
                OR (
                    can_access_agent(c.agent_id, 'property_casualty')
                    AND public.client_has_pc_policy(c.id)
                )
            )
        )
    );

ALTER TABLE public.client_residence_information ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Agents can manage residence info of their clients" ON public.client_residence_information;
CREATE POLICY "Agents can manage residence info of their clients"
    ON public.client_residence_information FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = client_id
            AND (
                c.agent_id = auth.uid()
                OR (
                    can_access_agent(c.agent_id, 'property_casualty')
                    AND public.client_has_pc_policy(c.id)
                )
            )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = client_id
            AND (
                c.agent_id = auth.uid()
                OR (
                    can_access_agent(c.agent_id, 'property_casualty')
                    AND public.client_has_pc_policy(c.id)
                )
            )
        )
    );

ALTER TABLE public.client_income_information ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Agents can manage income info of their clients" ON public.client_income_information;
CREATE POLICY "Agents can manage income info of their clients"
    ON public.client_income_information FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = client_id
            AND (
                c.agent_id = auth.uid()
                OR (
                    can_access_agent(c.agent_id, 'property_casualty')
                    AND public.client_has_pc_policy(c.id)
                )
            )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = client_id
            AND (
                c.agent_id = auth.uid()
                OR (
                    can_access_agent(c.agent_id, 'property_casualty')
                    AND public.client_has_pc_policy(c.id)
                )
            )
        )
    );

-- 6. RLS FOR POLICIES (Property & Casualty)
ALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agents can select policies of their clients" ON public.policies;
CREATE POLICY "Agents can select policies of their clients"
    ON public.policies FOR SELECT
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND can_access_agent(c.agent_id, 'property_casualty')));

DROP POLICY IF EXISTS "Agents can insert policies for their clients" ON public.policies;
CREATE POLICY "Agents can insert policies for their clients"
    ON public.policies FOR INSERT
    TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND can_access_agent(c.agent_id, 'property_casualty')));

DROP POLICY IF EXISTS "Agents can update policies of their clients" ON public.policies;
CREATE POLICY "Agents can update policies of their clients"
    ON public.policies FOR UPDATE
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND can_access_agent(c.agent_id, 'property_casualty')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND can_access_agent(c.agent_id, 'property_casualty')));

DROP POLICY IF EXISTS "Agents can delete policies of their clients" ON public.policies;
CREATE POLICY "Agents can delete policies of their clients"
    ON public.policies FOR DELETE
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND can_access_agent(c.agent_id, 'property_casualty')));

-- 7. RLS FOR HEALTH POLICIES (STRICTLY OWNER-PRIVATE FOR ALL OPERATIONS)
ALTER TABLE public.health_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agents can select health policies of their clients" ON public.health_policies;
DROP POLICY IF EXISTS "Health policies owner only select" ON public.health_policies;
CREATE POLICY "Health policies owner only select"
    ON public.health_policies FOR SELECT
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.agent_id = auth.uid()));

DROP POLICY IF EXISTS "Agents can insert health policies for their clients" ON public.health_policies;
DROP POLICY IF EXISTS "Health policies owner only insert" ON public.health_policies;
CREATE POLICY "Health policies owner only insert"
    ON public.health_policies FOR INSERT
    TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.agent_id = auth.uid()));

DROP POLICY IF EXISTS "Agents can update health policies of their clients" ON public.health_policies;
DROP POLICY IF EXISTS "Health policies owner only update" ON public.health_policies;
CREATE POLICY "Health policies owner only update"
    ON public.health_policies FOR UPDATE
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.agent_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.agent_id = auth.uid()));

DROP POLICY IF EXISTS "Agents can delete health policies of their clients" ON public.health_policies;
DROP POLICY IF EXISTS "Health policies owner only delete" ON public.health_policies;
CREATE POLICY "Health policies owner only delete"
    ON public.health_policies FOR DELETE
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.agent_id = auth.uid()));

-- 8. RLS FOR LIFE POLICIES (STRICTLY OWNER-PRIVATE FOR ALL OPERATIONS)
ALTER TABLE public.life_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agents can select life policies of their clients" ON public.life_policies;
DROP POLICY IF EXISTS "Life policies owner only select" ON public.life_policies;
CREATE POLICY "Life policies owner only select"
    ON public.life_policies FOR SELECT
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.agent_id = auth.uid()));

DROP POLICY IF EXISTS "Agents can insert life policies for their clients" ON public.life_policies;
DROP POLICY IF EXISTS "Life policies owner only insert" ON public.life_policies;
CREATE POLICY "Life policies owner only insert"
    ON public.life_policies FOR INSERT
    TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.agent_id = auth.uid()));

DROP POLICY IF EXISTS "Agents can update life policies of their clients" ON public.life_policies;
DROP POLICY IF EXISTS "Life policies owner only update" ON public.life_policies;
CREATE POLICY "Life policies owner only update"
    ON public.life_policies FOR UPDATE
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.agent_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.agent_id = auth.uid()));

DROP POLICY IF EXISTS "Agents can delete life policies of their clients" ON public.life_policies;
DROP POLICY IF EXISTS "Life policies owner only delete" ON public.life_policies;
CREATE POLICY "Life policies owner only delete"
    ON public.life_policies FOR DELETE
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.agent_id = auth.uid()));

-- 9. RLS FOR CLIENT NOTES (SCOPED TO PROPERTY_CASUALTY FOR SHARED ACCESS)
ALTER TABLE public.client_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agents can view client notes of accessible clients" ON public.client_notes;
DROP POLICY IF EXISTS "Client notes view policy" ON public.client_notes;
CREATE POLICY "Client notes view policy"
    ON public.client_notes FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = client_notes.client_id
            AND (
                c.agent_id = auth.uid()
                OR (
                    can_access_agent(c.agent_id, 'property_casualty')
                    AND client_notes.category = 'property_casualty'
                )
            )
        )
    );

DROP POLICY IF EXISTS "Agents can insert client notes for accessible clients" ON public.client_notes;
DROP POLICY IF EXISTS "Client notes insert policy" ON public.client_notes;
CREATE POLICY "Client notes insert policy"
    ON public.client_notes FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = client_notes.client_id
            AND (
                c.agent_id = auth.uid()
                OR (
                    can_access_agent(c.agent_id, 'property_casualty')
                    AND client_notes.category = 'property_casualty'
                )
            )
        )
    );

DROP POLICY IF EXISTS "Agents can update client notes of accessible clients" ON public.client_notes;
DROP POLICY IF EXISTS "Client notes update policy" ON public.client_notes;
CREATE POLICY "Client notes update policy"
    ON public.client_notes FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = client_notes.client_id
            AND (
                c.agent_id = auth.uid()
                OR (
                    can_access_agent(c.agent_id, 'property_casualty')
                    AND client_notes.category = 'property_casualty'
                )
            )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = client_notes.client_id
            AND (
                c.agent_id = auth.uid()
                OR (
                    can_access_agent(c.agent_id, 'property_casualty')
                    AND client_notes.category = 'property_casualty'
                )
            )
        )
    );

DROP POLICY IF EXISTS "Agents can delete client notes of accessible clients" ON public.client_notes;
DROP POLICY IF EXISTS "Client notes delete policy" ON public.client_notes;
CREATE POLICY "Client notes delete policy"
    ON public.client_notes FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = client_notes.client_id
            AND (
                c.agent_id = auth.uid()
                OR (
                    can_access_agent(c.agent_id, 'property_casualty')
                    AND client_notes.category = 'property_casualty'
                )
            )
        )
    );

-- 9b. RLS FOR CLIENT NOTE ATTACHMENTS (SCOPED TO PROPERTY_CASUALTY FOR SHARED ACCESS)
ALTER TABLE public.client_note_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agents can view attachments of accessible client notes" ON public.client_note_attachments;
DROP POLICY IF EXISTS "Client note attachments view policy" ON public.client_note_attachments;
CREATE POLICY "Client note attachments view policy"
    ON public.client_note_attachments FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.client_notes cn
            JOIN public.clients c ON c.id = cn.client_id
            WHERE cn.id = client_note_attachments.note_id
            AND (
                c.agent_id = auth.uid()
                OR (
                    can_access_agent(c.agent_id, 'property_casualty')
                    AND cn.category = 'property_casualty'
                )
            )
        )
    );

DROP POLICY IF EXISTS "Agents can insert attachments for accessible client notes" ON public.client_note_attachments;
DROP POLICY IF EXISTS "Client note attachments insert policy" ON public.client_note_attachments;
CREATE POLICY "Client note attachments insert policy"
    ON public.client_note_attachments FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.client_notes cn
            JOIN public.clients c ON c.id = cn.client_id
            WHERE cn.id = client_note_attachments.note_id
            AND (
                c.agent_id = auth.uid()
                OR (
                    can_access_agent(c.agent_id, 'property_casualty')
                    AND cn.category = 'property_casualty'
                )
            )
        )
    );

DROP POLICY IF EXISTS "Agents can delete attachments of accessible client notes" ON public.client_note_attachments;
DROP POLICY IF EXISTS "Client note attachments delete policy" ON public.client_note_attachments;
CREATE POLICY "Client note attachments delete policy"
    ON public.client_note_attachments FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.client_notes cn
            JOIN public.clients c ON c.id = cn.client_id
            WHERE cn.id = client_note_attachments.note_id
            AND (
                c.agent_id = auth.uid()
                OR (
                    can_access_agent(c.agent_id, 'property_casualty')
                    AND cn.category = 'property_casualty'
                )
            )
        )
    );

-- 9c. RLS FOR POLICY DOCUMENT SECTIONS AND DOCUMENTS (PROPERTY CASUALTY SHARED ACCESS)
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
    );

DROP POLICY IF EXISTS "Agents can insert sections for their policies" ON public.policy_document_sections;
DROP POLICY IF EXISTS "Policy document sections insert policy" ON public.policy_document_sections;
CREATE POLICY "Policy document sections insert policy"
    ON public.policy_document_sections FOR INSERT
    TO authenticated
    WITH CHECK (
        created_by = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.policies p
            JOIN public.clients c ON c.id = p.client_id
            WHERE p.id = policy_document_sections.policy_id
            AND (
                c.agent_id = auth.uid()
                OR can_access_agent(c.agent_id, 'property_casualty')
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
    );

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
    );

DROP POLICY IF EXISTS "Agents can insert documents for their policies" ON public.policy_documents;
DROP POLICY IF EXISTS "Policy documents insert policy" ON public.policy_documents;
CREATE POLICY "Policy documents insert policy"
    ON public.policy_documents FOR INSERT
    TO authenticated
    WITH CHECK (
        uploaded_by = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.policies p
            JOIN public.clients c ON c.id = p.client_id
            WHERE p.id = policy_documents.policy_id
            AND (
                c.agent_id = auth.uid()
                OR can_access_agent(c.agent_id, 'property_casualty')
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
    );

-- 10. RLS FOR OTHER MODULES (RESTORED TO STRICT OWNER-ONLY FOR ALL OPERATIONS)
-- Calendar Appointments
ALTER TABLE public.calendar_appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Agents can select appointments" ON public.calendar_appointments;
DROP POLICY IF EXISTS "Agents select appointments owner only" ON public.calendar_appointments;
CREATE POLICY "Agents select appointments owner only" ON public.calendar_appointments FOR SELECT TO authenticated USING (agent_id = auth.uid());

DROP POLICY IF EXISTS "Agents can update appointments" ON public.calendar_appointments;
DROP POLICY IF EXISTS "Agents update appointments owner only" ON public.calendar_appointments;
CREATE POLICY "Agents update appointments owner only" ON public.calendar_appointments FOR UPDATE TO authenticated USING (agent_id = auth.uid()) WITH CHECK (agent_id = auth.uid());

-- Leads
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Agents can select their own leads" ON public.leads;
DROP POLICY IF EXISTS "Agents select leads owner only" ON public.leads;
CREATE POLICY "Agents select leads owner only" ON public.leads FOR SELECT TO authenticated USING (agent_id = auth.uid());

DROP POLICY IF EXISTS "Agents can update their own leads" ON public.leads;
DROP POLICY IF EXISTS "Agents update leads owner only" ON public.leads;
CREATE POLICY "Agents update leads owner only" ON public.leads FOR UPDATE TO authenticated USING (agent_id = auth.uid()) WITH CHECK (agent_id = auth.uid());

-- Consent Templates
ALTER TABLE public.consent_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Agents can view their own consent templates" ON public.consent_templates;
DROP POLICY IF EXISTS "Agents select consent templates owner only" ON public.consent_templates;
CREATE POLICY "Agents select consent templates owner only" ON public.consent_templates FOR SELECT TO authenticated USING (agent_id = auth.uid());

DROP POLICY IF EXISTS "Agents can update their own consent templates" ON public.consent_templates;
DROP POLICY IF EXISTS "Agents update consent templates owner only" ON public.consent_templates;
CREATE POLICY "Agents update consent templates owner only" ON public.consent_templates FOR UPDATE TO authenticated USING (agent_id = auth.uid()) WITH CHECK (agent_id = auth.uid());

-- Signature Requests (OWNER-PRIVATE VIA CLIENT_ID -> CLIENTS.AGENT_ID)
ALTER TABLE public.signature_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agents can select signature requests" ON public.signature_requests;
DROP POLICY IF EXISTS "Agents can select requests of their clients" ON public.signature_requests;
DROP POLICY IF EXISTS "Agents select signature requests owner only" ON public.signature_requests;
CREATE POLICY "Agents select signature requests owner only"
    ON public.signature_requests FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = signature_requests.client_id
            AND c.agent_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Agents can insert signature requests" ON public.signature_requests;
DROP POLICY IF EXISTS "Agents insert signature requests owner only" ON public.signature_requests;
CREATE POLICY "Agents insert signature requests owner only"
    ON public.signature_requests FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = signature_requests.client_id
            AND c.agent_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Agents can update signature requests" ON public.signature_requests;
DROP POLICY IF EXISTS "Agents can update requests of their clients" ON public.signature_requests;
DROP POLICY IF EXISTS "Agents update signature requests owner only" ON public.signature_requests;
CREATE POLICY "Agents update signature requests owner only"
    ON public.signature_requests FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = signature_requests.client_id
            AND c.agent_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = signature_requests.client_id
            AND c.agent_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Agents can delete signature requests" ON public.signature_requests;
DROP POLICY IF EXISTS "Agents delete draft signature requests owner only" ON public.signature_requests;
CREATE POLICY "Agents delete draft signature requests owner only"
    ON public.signature_requests FOR DELETE
    TO authenticated
    USING (
        signature_requests.status = 'draft'
        AND EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = signature_requests.client_id
            AND c.agent_id = auth.uid()
        )
    );

-- 11. CLEANUP LEGACY ONE-ARGUMENT FUNCTION SIGNATURE
-- Safely drop legacy public.can_access_agent(UUID) overload AFTER all legacy dependent policies have been dropped/replaced.
DROP FUNCTION IF EXISTS public.can_access_agent(UUID);

NOTIFY pgrst, 'reload schema';
