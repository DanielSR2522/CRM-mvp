-- =====================================================================================
-- Migration: 20260807_agent_shared_access.sql
-- Description: Creates agent_shared_access table, can_access_agent() security helper,
--              and updates RLS policies across all CRM tables for multi-agent shared scope.
-- =====================================================================================

-- 1. Create agent_shared_access table
CREATE TABLE IF NOT EXISTS public.agent_shared_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    shared_agent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_agent_shared_pair UNIQUE(agent_id, shared_agent_id),
    CONSTRAINT chk_no_self_sharing CHECK (agent_id <> shared_agent_id)
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_agent_shared_access_pair 
    ON public.agent_shared_access (agent_id, shared_agent_id);

CREATE INDEX IF NOT EXISTS idx_agent_shared_access_rev_pair 
    ON public.agent_shared_access (shared_agent_id, agent_id);

-- Enable RLS on agent_shared_access
ALTER TABLE public.agent_shared_access ENABLE ROW LEVEL SECURITY;

-- RLS policies for agent_shared_access
DROP POLICY IF EXISTS "Agents can view their shared access links" ON public.agent_shared_access;
CREATE POLICY "Agents can view their shared access links"
    ON public.agent_shared_access FOR SELECT
    TO authenticated
    USING (agent_id = auth.uid() OR shared_agent_id = auth.uid());

DROP POLICY IF EXISTS "Agents can insert their shared access links" ON public.agent_shared_access;
CREATE POLICY "Agents can insert their shared access links"
    ON public.agent_shared_access FOR INSERT
    TO authenticated
    WITH CHECK (agent_id = auth.uid());

DROP POLICY IF EXISTS "Agents can delete their shared access links" ON public.agent_shared_access;
CREATE POLICY "Agents can delete their shared access links"
    ON public.agent_shared_access FOR DELETE
    TO authenticated
    USING (agent_id = auth.uid() OR shared_agent_id = auth.uid());

-- 2. Central can_access_agent security function
CREATE OR REPLACE FUNCTION public.can_access_agent(target_agent_id UUID)
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
        WHERE (agent_id = auth.uid() AND shared_agent_id = target_agent_id)
           OR (shared_agent_id = auth.uid() AND agent_id = target_agent_id)
    );
END;
$$;

-- 3. UPDATE RLS POLICIES FOR CRM TABLES

-- A. clients
DROP POLICY IF EXISTS "Agents can view their own clients" ON public.clients;
CREATE POLICY "Agents can view their own clients"
    ON public.clients FOR SELECT
    TO authenticated
    USING (can_access_agent(agent_id));

DROP POLICY IF EXISTS "Agents can update their own clients" ON public.clients;
CREATE POLICY "Agents can update their own clients"
    ON public.clients FOR UPDATE
    TO authenticated
    USING (can_access_agent(agent_id))
    WITH CHECK (can_access_agent(agent_id));

-- B. client_personal_information, residence, income
DROP POLICY IF EXISTS "Agents can manage personal info of their clients" ON public.client_personal_information;
CREATE POLICY "Agents can manage personal info of their clients"
    ON public.client_personal_information FOR ALL
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND can_access_agent(c.agent_id)))
    WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND can_access_agent(c.agent_id)));

DROP POLICY IF EXISTS "Agents can manage residence info of their clients" ON public.client_residence_information;
CREATE POLICY "Agents can manage residence info of their clients"
    ON public.client_residence_information FOR ALL
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND can_access_agent(c.agent_id)))
    WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND can_access_agent(c.agent_id)));

DROP POLICY IF EXISTS "Agents can manage income info of their clients" ON public.client_income_information;
CREATE POLICY "Agents can manage income info of their clients"
    ON public.client_income_information FOR ALL
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND can_access_agent(c.agent_id)))
    WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND can_access_agent(c.agent_id)));

-- C. policies (P&C)
DROP POLICY IF EXISTS "Agents can select policies of their clients" ON public.policies;
CREATE POLICY "Agents can select policies of their clients"
    ON public.policies FOR SELECT
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND can_access_agent(c.agent_id)));

DROP POLICY IF EXISTS "Agents can insert policies for their clients" ON public.policies;
CREATE POLICY "Agents can insert policies for their clients"
    ON public.policies FOR INSERT
    TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND can_access_agent(c.agent_id)));

DROP POLICY IF EXISTS "Agents can update policies of their clients" ON public.policies;
CREATE POLICY "Agents can update policies of their clients"
    ON public.policies FOR UPDATE
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND can_access_agent(c.agent_id)))
    WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND can_access_agent(c.agent_id)));

-- D. health_policies
DROP POLICY IF EXISTS "Agents can select health policies of their clients" ON public.health_policies;
CREATE POLICY "Agents can select health policies of their clients"
    ON public.health_policies FOR SELECT
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND can_access_agent(c.agent_id)));

DROP POLICY IF EXISTS "Agents can insert health policies for their clients" ON public.health_policies;
CREATE POLICY "Agents can insert health policies for their clients"
    ON public.health_policies FOR INSERT
    TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND can_access_agent(c.agent_id)));

DROP POLICY IF EXISTS "Agents can update health policies of their clients" ON public.health_policies;
CREATE POLICY "Agents can update health policies of their clients"
    ON public.health_policies FOR UPDATE
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND can_access_agent(c.agent_id)))
    WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND can_access_agent(c.agent_id)));

-- E. life_policies
DROP POLICY IF EXISTS "Agents can select life policies of their clients" ON public.life_policies;
CREATE POLICY "Agents can select life policies of their clients"
    ON public.life_policies FOR SELECT
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND can_access_agent(c.agent_id)));

DROP POLICY IF EXISTS "Agents can insert life policies for their clients" ON public.life_policies;
CREATE POLICY "Agents can insert life policies for their clients"
    ON public.life_policies FOR INSERT
    TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND can_access_agent(c.agent_id)));

DROP POLICY IF EXISTS "Agents can update life policies of their clients" ON public.life_policies;
CREATE POLICY "Agents can update life policies of their clients"
    ON public.life_policies FOR UPDATE
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND can_access_agent(c.agent_id)))
    WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND can_access_agent(c.agent_id)));

-- F. calendar_appointments
DROP POLICY IF EXISTS "Agents can select appointments" ON public.calendar_appointments;
CREATE POLICY "Agents can select appointments"
    ON public.calendar_appointments FOR SELECT
    TO authenticated
    USING (can_access_agent(agent_id));

DROP POLICY IF EXISTS "Agents can update appointments" ON public.calendar_appointments;
CREATE POLICY "Agents can update appointments"
    ON public.calendar_appointments FOR UPDATE
    TO authenticated
    USING (can_access_agent(agent_id))
    WITH CHECK (can_access_agent(agent_id));

-- G. consent_templates
DROP POLICY IF EXISTS "Agents can view their own consent templates" ON public.consent_templates;
CREATE POLICY "Agents can view their own consent templates"
    ON public.consent_templates FOR SELECT
    TO authenticated
    USING (can_access_agent(agent_id));

DROP POLICY IF EXISTS "Agents can update their own consent templates" ON public.consent_templates;
CREATE POLICY "Agents can update their own consent templates"
    ON public.consent_templates FOR UPDATE
    TO authenticated
    USING (can_access_agent(agent_id))
    WITH CHECK (can_access_agent(agent_id));

-- H. signature_requests
DROP POLICY IF EXISTS "Agents can select signature requests" ON public.signature_requests;
DROP POLICY IF EXISTS "Agents can select requests of their clients" ON public.signature_requests;
CREATE POLICY "Agents can select signature requests"
    ON public.signature_requests FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = signature_requests.client_id
            AND can_access_agent(c.agent_id)
        )
    );

DROP POLICY IF EXISTS "Agents can update signature requests" ON public.signature_requests;
DROP POLICY IF EXISTS "Agents can update requests of their clients" ON public.signature_requests;
CREATE POLICY "Agents can update signature requests"
    ON public.signature_requests FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = signature_requests.client_id
            AND can_access_agent(c.agent_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = signature_requests.client_id
            AND can_access_agent(c.agent_id)
        )
    );

-- I. leads
DROP POLICY IF EXISTS "Agents can select their own leads" ON public.leads;
CREATE POLICY "Agents can select their own leads"
    ON public.leads FOR SELECT
    TO authenticated
    USING (can_access_agent(agent_id));

DROP POLICY IF EXISTS "Agents can update their own leads" ON public.leads;
CREATE POLICY "Agents can update their own leads"
    ON public.leads FOR UPDATE
    TO authenticated
    USING (can_access_agent(agent_id))
    WITH CHECK (can_access_agent(agent_id));
