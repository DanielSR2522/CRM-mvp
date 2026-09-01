-- =====================================================================================
-- Migration: 20260831000000_create_carrier_scheduled_sync_engine.sql
-- Description: Multi-Carrier Scheduled Sync Engine (Every 8 Hours) with RLS & RPC
-- =====================================================================================

-- 1. Extend carrier_connections table with scheduling columns
ALTER TABLE public.carrier_connections
    ADD COLUMN IF NOT EXISTS automation_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS sync_interval_hours INT NOT NULL DEFAULT 8,
    ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/New_York',
    ADD COLUMN IF NOT EXISTS last_scheduled_sync_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS next_sync_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_success_at TIMESTAMPTZ;

-- 2. Create carrier_sync_jobs queue table
CREATE TABLE IF NOT EXISTS public.carrier_sync_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    connection_id UUID REFERENCES public.carrier_connections(id) ON DELETE CASCADE,
    carrier TEXT NOT NULL DEFAULT 'oscar',
    trigger_type TEXT NOT NULL DEFAULT 'scheduled', -- 'manual', 'scheduled', 'retry'
    status TEXT NOT NULL DEFAULT 'queued', -- 'queued', 'running', 'completed', 'failed', 'reauthentication_required', 'skipped'
    scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    error_code TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_carrier_sync_jobs_schedule UNIQUE (connection_id, scheduled_for, trigger_type)
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_carrier_sync_jobs_status ON public.carrier_sync_jobs(status);
CREATE INDEX IF NOT EXISTS idx_carrier_sync_jobs_agent_carrier ON public.carrier_sync_jobs(agent_id, carrier);
CREATE INDEX IF NOT EXISTS idx_carrier_sync_jobs_scheduled_for ON public.carrier_sync_jobs(scheduled_for);

-- 3. Enable RLS on carrier_sync_jobs
ALTER TABLE public.carrier_sync_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agent isolated carrier_sync_jobs SELECT" ON public.carrier_sync_jobs;
CREATE POLICY "Agent isolated carrier_sync_jobs SELECT" ON public.carrier_sync_jobs
    FOR SELECT TO authenticated USING (agent_id = auth.uid() OR public.can_access_agent(agent_id));

DROP POLICY IF EXISTS "Agent isolated carrier_sync_jobs INSERT" ON public.carrier_sync_jobs;
CREATE POLICY "Agent isolated carrier_sync_jobs INSERT" ON public.carrier_sync_jobs
    FOR INSERT TO authenticated WITH CHECK (agent_id = auth.uid());

DROP POLICY IF EXISTS "Agent isolated carrier_sync_jobs UPDATE" ON public.carrier_sync_jobs;
CREATE POLICY "Agent isolated carrier_sync_jobs UPDATE" ON public.carrier_sync_jobs
    FOR UPDATE TO authenticated USING (agent_id = auth.uid() OR public.can_access_agent(agent_id));

DROP POLICY IF EXISTS "Agent isolated carrier_sync_jobs DELETE" ON public.carrier_sync_jobs;
CREATE POLICY "Agent isolated carrier_sync_jobs DELETE" ON public.carrier_sync_jobs
    FOR DELETE TO authenticated USING (agent_id = auth.uid() OR public.can_access_agent(agent_id));

-- 4. Atomic RPC function for worker job claiming with FOR UPDATE SKIP LOCKED
CREATE OR REPLACE FUNCTION public.claim_next_carrier_sync_job(worker_id TEXT DEFAULT 'worker-1')
RETURNS SETOF public.carrier_sync_jobs
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_job public.carrier_sync_jobs;
BEGIN
    SELECT * INTO v_job
    FROM public.carrier_sync_jobs
    WHERE status = 'queued'
      AND scheduled_for <= NOW()
    ORDER BY scheduled_for ASC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1;

    IF v_job.id IS NOT NULL THEN
        UPDATE public.carrier_sync_jobs
        SET status = 'running',
            started_at = NOW(),
            attempts = attempts + 1,
            updated_at = NOW()
        WHERE id = v_job.id
        RETURNING * INTO v_job;

        RETURN NEXT v_job;
    END IF;

    RETURN;
END;
$$;
