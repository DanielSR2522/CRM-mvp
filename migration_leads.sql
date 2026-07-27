-- =====================================================================================
-- SmarTrack CRM — Leads Module Migration (Phase 1 Revised)
-- File:    migration_leads.sql
--
-- WHAT THIS MIGRATION DOES:
--   Creates the `public.leads` table, foreign keys, CHECK constraints, indexes,
--   partial indexes, row level security (RLS) policies, and an updated_at trigger.
-- =====================================================================================

-- 1. LEADS TABLE
-- =====================================================================================
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    converted_client_id UUID NULL REFERENCES public.clients(id) ON DELETE SET NULL,

    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT NULL,
    email TEXT NULL,

    product_interest TEXT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    priority TEXT NOT NULL DEFAULT 'medium',
    next_follow_up_at TIMESTAMPTZ NULL,

    address TEXT NULL,
    city TEXT NULL,
    state TEXT NULL,
    zip_code TEXT NULL,

    converted_at TIMESTAMPTZ NULL,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT leads_first_name_check CHECK (length(trim(first_name)) > 0),
    CONSTRAINT leads_last_name_check CHECK (length(trim(last_name)) > 0),
    CONSTRAINT leads_status_check CHECK (status IN ('new', 'contacted', 'in_progress', 'qualified', 'converted', 'lost')),
    CONSTRAINT leads_priority_check CHECK (priority IN ('low', 'medium', 'high')),
    CONSTRAINT leads_converted_client_check CHECK (
        (status = 'converted' AND converted_client_id IS NOT NULL AND converted_at IS NOT NULL) OR
        (status <> 'converted' AND converted_client_id IS NULL AND converted_at IS NULL)
    )
);

-- Enable Row Level Security
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- 2. INDEXES
-- =====================================================================================
CREATE INDEX IF NOT EXISTS leads_agent_id_idx ON public.leads(agent_id);
CREATE INDEX IF NOT EXISTS leads_status_idx ON public.leads(status);
CREATE INDEX IF NOT EXISTS leads_priority_idx ON public.leads(priority);
CREATE INDEX IF NOT EXISTS leads_created_at_idx ON public.leads(created_at);
CREATE INDEX IF NOT EXISTS leads_next_follow_up_at_idx ON public.leads(next_follow_up_at);
CREATE INDEX IF NOT EXISTS leads_last_activity_at_idx ON public.leads(last_activity_at);
CREATE INDEX IF NOT EXISTS leads_converted_client_id_idx ON public.leads(converted_client_id);

-- Partial Indexes
CREATE INDEX IF NOT EXISTS leads_lower_email_idx ON public.leads(lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_phone_idx ON public.leads(phone) WHERE phone IS NOT NULL;

-- 3. UPDATED_AT TRIGGER
-- =====================================================================================
CREATE OR REPLACE FUNCTION public.leads_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS leads_set_updated_at_trg ON public.leads;
CREATE TRIGGER leads_set_updated_at_trg
    BEFORE UPDATE ON public.leads
    FOR EACH ROW
    EXECUTE FUNCTION public.leads_set_updated_at();

-- 4. ROW LEVEL SECURITY POLICIES
-- =====================================================================================
DO $$
BEGIN
    -- SELECT Policy
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'leads' AND policyname = 'Agents can select their own leads') THEN
        CREATE POLICY "Agents can select their own leads"
            ON public.leads
            FOR SELECT
            TO authenticated
            USING (agent_id = auth.uid());
    END IF;

    -- INSERT Policy (Validates agent_id and converted_client_id ownership via EXISTS)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'leads' AND policyname = 'Agents can insert their own leads') THEN
        CREATE POLICY "Agents can insert their own leads"
            ON public.leads
            FOR INSERT
            TO authenticated
            WITH CHECK (
                agent_id = auth.uid() AND
                (
                    converted_client_id IS NULL OR
                    EXISTS (
                        SELECT 1 FROM public.clients
                        WHERE clients.id = leads.converted_client_id
                          AND clients.agent_id = auth.uid()
                    )
                )
            );
    END IF;

    -- UPDATE Policy (Validates agent_id and converted_client_id ownership via EXISTS)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'leads' AND policyname = 'Agents can update their own leads') THEN
        CREATE POLICY "Agents can update their own leads"
            ON public.leads
            FOR UPDATE
            TO authenticated
            USING (agent_id = auth.uid())
            WITH CHECK (
                agent_id = auth.uid() AND
                (
                    converted_client_id IS NULL OR
                    EXISTS (
                        SELECT 1 FROM public.clients
                        WHERE clients.id = leads.converted_client_id
                          AND clients.agent_id = auth.uid()
                    )
                )
            );
    END IF;

    -- DELETE Policy
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'leads' AND policyname = 'Agents can delete their own leads') THEN
        CREATE POLICY "Agents can delete their own leads"
            ON public.leads
            FOR DELETE
            TO authenticated
            USING (agent_id = auth.uid());
    END IF;
END $$;
