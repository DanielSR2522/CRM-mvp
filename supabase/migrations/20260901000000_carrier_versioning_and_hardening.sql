-- Carrier Portals Reliability & Versioning Hardening Migration
-- 1. Add last_successful_sync_run_id to carrier_connections
ALTER TABLE public.carrier_connections
ADD COLUMN IF NOT EXISTS last_successful_sync_run_id UUID REFERENCES public.carrier_sync_runs(id) ON DELETE SET NULL;

-- 2. Add worker lease metadata columns to carrier_sync_jobs
ALTER TABLE public.carrier_sync_jobs
ADD COLUMN IF NOT EXISTS worker_id TEXT,
ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;

-- 3. Database-level Active Job Uniqueness Constraint (Maximum 1 queued or running job per agent + carrier)
DROP INDEX IF EXISTS uq_carrier_sync_jobs_active_per_connection;
CREATE UNIQUE INDEX uq_carrier_sync_jobs_active_per_connection
ON public.carrier_sync_jobs(agent_id, carrier)
WHERE status IN ('queued', 'running');

-- 4. Worker Heartbeat & Health Lease Table
CREATE TABLE IF NOT EXISTS public.carrier_worker_leases (
    worker_id TEXT PRIMARY KEY,
    last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'online'
);

ALTER TABLE public.carrier_worker_leases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read carrier_worker_leases" ON public.carrier_worker_leases;
CREATE POLICY "Public read carrier_worker_leases" ON public.carrier_worker_leases FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated write carrier_worker_leases" ON public.carrier_worker_leases;
CREATE POLICY "Authenticated write carrier_worker_leases" ON public.carrier_worker_leases FOR ALL USING (true);
