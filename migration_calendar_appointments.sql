-- =====================================================================================
-- SmarTrack CRM — Calendar Appointments Module
-- File:    migration_calendar_appointments.sql
--
-- WHAT THIS MIGRATION DOES:
--   Creates the `calendar_appointments` table, indexes, CHECK constraints,
--   row level security policies (SELECT, INSERT, UPDATE, DELETE), and an updated_at trigger.
-- =====================================================================================

-- 1. CALENDAR APPOINTMENTS TABLE
-- =====================================================================================
CREATE TABLE IF NOT EXISTS public.calendar_appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id UUID NULL REFERENCES public.clients(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT NULL,
    location TEXT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT calendar_appointments_ends_at_check CHECK (ends_at > starts_at),
    CONSTRAINT calendar_appointments_status_check CHECK (status IN ('scheduled', 'completed', 'cancelled'))
);

-- Enable RLS
ALTER TABLE public.calendar_appointments ENABLE ROW LEVEL SECURITY;

-- 2. INDEXES
-- =====================================================================================
CREATE INDEX IF NOT EXISTS calendar_appointments_agent_id_idx ON public.calendar_appointments(agent_id);
CREATE INDEX IF NOT EXISTS calendar_appointments_client_id_idx ON public.calendar_appointments(client_id);
CREATE INDEX IF NOT EXISTS calendar_appointments_starts_at_idx ON public.calendar_appointments(starts_at);
CREATE INDEX IF NOT EXISTS calendar_appointments_ends_at_idx ON public.calendar_appointments(ends_at);

-- 3. UPDATED_AT TRIGGER
-- =====================================================================================
CREATE OR REPLACE FUNCTION public.calendar_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calendar_appointments_set_updated_at_trg ON public.calendar_appointments;
CREATE TRIGGER calendar_appointments_set_updated_at_trg
    BEFORE UPDATE ON public.calendar_appointments
    FOR EACH ROW
    EXECUTE FUNCTION public.calendar_set_updated_at();

-- 4. ROW LEVEL SECURITY POLICIES
-- =====================================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'calendar_appointments' AND policyname = 'Agents can select their own appointments') THEN
        CREATE POLICY "Agents can select their own appointments"
        ON public.calendar_appointments
        FOR SELECT TO authenticated
        USING (agent_id = auth.uid());
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'calendar_appointments' AND policyname = 'Agents can insert their own appointments') THEN
        CREATE POLICY "Agents can insert their own appointments"
        ON public.calendar_appointments
        FOR INSERT TO authenticated
        WITH CHECK (
            agent_id = auth.uid() 
            AND (
                client_id IS NULL 
                OR EXISTS (
                    SELECT 1 FROM public.clients c 
                    WHERE c.id = client_id AND c.agent_id = auth.uid()
                )
            )
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'calendar_appointments' AND policyname = 'Agents can update their own appointments') THEN
        CREATE POLICY "Agents can update their own appointments"
        ON public.calendar_appointments
        FOR UPDATE TO authenticated
        USING (agent_id = auth.uid())
        WITH CHECK (
            agent_id = auth.uid() 
            AND (
                client_id IS NULL 
                OR EXISTS (
                    SELECT 1 FROM public.clients c 
                    WHERE c.id = client_id AND c.agent_id = auth.uid()
                )
            )
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'calendar_appointments' AND policyname = 'Agents can delete their own appointments') THEN
        CREATE POLICY "Agents can delete their own appointments"
        ON public.calendar_appointments
        FOR DELETE TO authenticated
        USING (agent_id = auth.uid());
    END IF;
END $$;
