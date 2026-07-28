-- =====================================================================================
-- SmarTrack CRM — Calendar Recurrence & Duplication Migration
-- File:    migration_calendar_recurrence.sql
--
-- WHAT THIS MIGRATION DOES:
--   1. Creates `public.calendar_recurrence_series` table for recurring appointment rules.
--   2. Adds recurrence columns to `public.calendar_appointments`:
--      - recurrence_series_id (FK to calendar_recurrence_series)
--      - recurrence_original_start (timestamptz)
--      - is_recurrence_exception (boolean)
--   3. Configures RLS policies for agent ownership over recurrence series.
-- =====================================================================================

-- 1. CALENDAR RECURRENCE SERIES TABLE
-- =====================================================================================
CREATE TABLE IF NOT EXISTS public.calendar_recurrence_series (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id UUID NULL REFERENCES public.clients(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT NULL,
    location TEXT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled',
    start_date DATE NOT NULL,
    start_time TIME NOT NULL,
    duration_minutes INTEGER NOT NULL,
    frequency TEXT NOT NULL,
    interval_count INTEGER NOT NULL DEFAULT 1,
    day_of_week INTEGER NULL,
    day_of_month INTEGER NULL,
    end_type TEXT NOT NULL,
    ends_on DATE NULL,
    occurrence_count INTEGER NULL,
    timezone TEXT NOT NULL DEFAULT 'America/New_York',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT calendar_recurrence_frequency_check CHECK (frequency IN ('weekly', 'monthly', 'yearly')),
    CONSTRAINT calendar_recurrence_end_type_check CHECK (end_type IN ('never', 'on_date', 'after_count')),
    CONSTRAINT calendar_recurrence_duration_check CHECK (duration_minutes > 0),
    CONSTRAINT calendar_recurrence_interval_check CHECK (interval_count > 0)
);

-- Enable RLS
ALTER TABLE public.calendar_recurrence_series ENABLE ROW LEVEL SECURITY;

-- 2. ADD RECURRENCE COLUMNS TO CALENDAR_APPOINTMENTS (IF NOT EXISTS)
-- =====================================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'calendar_appointments' 
        AND column_name = 'recurrence_series_id'
    ) THEN
        ALTER TABLE public.calendar_appointments 
        ADD COLUMN recurrence_series_id UUID NULL REFERENCES public.calendar_recurrence_series(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'calendar_appointments' 
        AND column_name = 'recurrence_original_start'
    ) THEN
        ALTER TABLE public.calendar_appointments 
        ADD COLUMN recurrence_original_start TIMESTAMPTZ NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'calendar_appointments' 
        AND column_name = 'is_recurrence_exception'
    ) THEN
        ALTER TABLE public.calendar_appointments 
        ADD COLUMN is_recurrence_exception BOOLEAN NOT NULL DEFAULT false;
    END IF;
END $$;

-- 3. INDEXES FOR RECURRENCE
-- =====================================================================================
CREATE INDEX IF NOT EXISTS calendar_recurrence_series_agent_id_idx ON public.calendar_recurrence_series(agent_id);
CREATE INDEX IF NOT EXISTS calendar_recurrence_series_client_id_idx ON public.calendar_recurrence_series(client_id);
CREATE INDEX IF NOT EXISTS calendar_appointments_series_id_idx ON public.calendar_appointments(recurrence_series_id);

-- 4. ROW LEVEL SECURITY POLICIES FOR RECURRENCE SERIES
-- =====================================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'calendar_recurrence_series' AND policyname = 'Agents can select their own recurrence series') THEN
        CREATE POLICY "Agents can select their own recurrence series"
        ON public.calendar_recurrence_series
        FOR SELECT TO authenticated
        USING (agent_id = auth.uid());
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'calendar_recurrence_series' AND policyname = 'Agents can insert their own recurrence series') THEN
        CREATE POLICY "Agents can insert their own recurrence series"
        ON public.calendar_recurrence_series
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

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'calendar_recurrence_series' AND policyname = 'Agents can update their own recurrence series') THEN
        CREATE POLICY "Agents can update their own recurrence series"
        ON public.calendar_recurrence_series
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

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'calendar_recurrence_series' AND policyname = 'Agents can delete their own recurrence series') THEN
        CREATE POLICY "Agents can delete their own recurrence series"
        ON public.calendar_recurrence_series
        FOR DELETE TO authenticated
        USING (agent_id = auth.uid());
    END IF;
END $$;
