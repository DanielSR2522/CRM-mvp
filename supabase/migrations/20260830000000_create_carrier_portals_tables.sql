-- =====================================================================================
-- Migration: 20260830000000_create_carrier_portals_tables.sql
-- Description: Carrier Portals module database architecture with RLS policies
-- =====================================================================================

-- 1. carrier_connections
CREATE TABLE IF NOT EXISTS public.carrier_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    carrier TEXT NOT NULL DEFAULT 'oscar',
    connection_status TEXT NOT NULL DEFAULT 'imported', -- 'imported', 'never_synced', 'connected', 'error'
    sync_source TEXT NOT NULL DEFAULT 'manual_csv', -- 'manual_csv', 'automated_portal'
    last_sync_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_carrier_connections_agent_carrier UNIQUE (agent_id, carrier)
);

CREATE INDEX IF NOT EXISTS idx_carrier_connections_agent_carrier ON public.carrier_connections(agent_id, carrier);

-- 2. carrier_sync_runs
CREATE TABLE IF NOT EXISTS public.carrier_sync_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID REFERENCES public.carrier_connections(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    carrier TEXT NOT NULL DEFAULT 'oscar',
    source TEXT NOT NULL DEFAULT 'manual_csv',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed'
    records_found INT NOT NULL DEFAULT 0,
    matched_count INT NOT NULL DEFAULT 0,
    review_count INT NOT NULL DEFAULT 0,
    unmatched_count INT NOT NULL DEFAULT 0,
    changed_count INT NOT NULL DEFAULT 0,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_carrier_sync_runs_agent_carrier ON public.carrier_sync_runs(agent_id, carrier);
CREATE INDEX IF NOT EXISTS idx_carrier_sync_runs_started_at ON public.carrier_sync_runs(started_at DESC);

-- 3. carrier_records (Latest normalized carrier state)
CREATE TABLE IF NOT EXISTS public.carrier_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID REFERENCES public.carrier_connections(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    carrier TEXT NOT NULL DEFAULT 'oscar',
    external_member_id TEXT NOT NULL,
    member_name TEXT NOT NULL,
    date_of_birth DATE,
    email TEXT,
    phone TEXT,
    mailing_address TEXT,
    state TEXT,
    enrollment_type TEXT,
    on_exchange BOOLEAN DEFAULT TRUE,
    plan TEXT,
    balance NUMERIC(10, 2) DEFAULT 0,
    premium_amount NUMERIC(10, 2) DEFAULT 0,
    aptc_subsidy NUMERIC(10, 2) DEFAULT 0,
    lives INT DEFAULT 1,
    coverage_start_date DATE,
    coverage_end_date DATE,
    carrier_status TEXT NOT NULL DEFAULT 'active', -- 'active', 'inactive', 'grace_period'
    autopay BOOLEAN DEFAULT FALSE,
    account_creation_status TEXT,
    ichra_member BOOLEAN DEFAULT FALSE,
    estimated_fpl TEXT,
    verification_needed TEXT,
    verification_completed TEXT,
    raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    latest_sync_run_id UUID REFERENCES public.carrier_sync_runs(id) ON DELETE SET NULL,
    CONSTRAINT uq_carrier_records_agent_carrier_ext_member UNIQUE (agent_id, carrier, external_member_id)
);

CREATE INDEX IF NOT EXISTS idx_carrier_records_agent_carrier ON public.carrier_records(agent_id, carrier);
CREATE INDEX IF NOT EXISTS idx_carrier_records_ext_member ON public.carrier_records(external_member_id);
CREATE INDEX IF NOT EXISTS idx_carrier_records_status ON public.carrier_records(carrier_status);

-- 4. carrier_client_matches
CREATE TABLE IF NOT EXISTS public.carrier_client_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    carrier TEXT NOT NULL DEFAULT 'oscar',
    external_member_id TEXT NOT NULL,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    match_status TEXT NOT NULL DEFAULT 'unmatched', -- 'matched', 'review', 'unmatched', 'ignored'
    confidence_score INT NOT NULL DEFAULT 0,
    match_method TEXT,
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_carrier_client_matches_pair UNIQUE (agent_id, carrier, external_member_id)
);

CREATE INDEX IF NOT EXISTS idx_carrier_client_matches_agent ON public.carrier_client_matches(agent_id, carrier);
CREATE INDEX IF NOT EXISTS idx_carrier_client_matches_client ON public.carrier_client_matches(client_id);
CREATE INDEX IF NOT EXISTS idx_carrier_client_matches_status ON public.carrier_client_matches(match_status);

-- 5. carrier_policy_snapshots (Append-only historical snapshots)
CREATE TABLE IF NOT EXISTS public.carrier_policy_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sync_run_id UUID REFERENCES public.carrier_sync_runs(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    carrier TEXT NOT NULL DEFAULT 'oscar',
    external_member_id TEXT NOT NULL,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    carrier_status TEXT,
    balance NUMERIC(10, 2),
    premium_amount NUMERIC(10, 2),
    plan TEXT,
    coverage_start_date DATE,
    coverage_end_date DATE,
    autopay BOOLEAN,
    snapshot_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_carrier_snapshots_sync ON public.carrier_policy_snapshots(sync_run_id);
CREATE INDEX IF NOT EXISTS idx_carrier_snapshots_agent_member ON public.carrier_policy_snapshots(agent_id, carrier, external_member_id);

-- 6. carrier_events
CREATE TABLE IF NOT EXISTS public.carrier_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    carrier TEXT NOT NULL DEFAULT 'oscar',
    external_member_id TEXT NOT NULL,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    sync_run_id UUID REFERENCES public.carrier_sync_runs(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'info', -- 'info', 'warning', 'critical'
    previous_value JSONB,
    current_value JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_carrier_events_agent ON public.carrier_events(agent_id, carrier);
CREATE INDEX IF NOT EXISTS idx_carrier_events_sync ON public.carrier_events(sync_run_id);
CREATE INDEX IF NOT EXISTS idx_carrier_events_type ON public.carrier_events(event_type);

-- Enable RLS across all tables
ALTER TABLE public.carrier_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carrier_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carrier_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carrier_client_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carrier_policy_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carrier_events ENABLE ROW LEVEL SECURITY;

-- Helper RLS macro policies for agent isolation
-- 1. carrier_connections
DROP POLICY IF EXISTS "Agent isolated carrier_connections SELECT" ON public.carrier_connections;
CREATE POLICY "Agent isolated carrier_connections SELECT" ON public.carrier_connections
    FOR SELECT TO authenticated USING (agent_id = auth.uid() OR public.can_access_agent(agent_id));

DROP POLICY IF EXISTS "Agent isolated carrier_connections INSERT" ON public.carrier_connections;
CREATE POLICY "Agent isolated carrier_connections INSERT" ON public.carrier_connections
    FOR INSERT TO authenticated WITH CHECK (agent_id = auth.uid());

DROP POLICY IF EXISTS "Agent isolated carrier_connections UPDATE" ON public.carrier_connections;
CREATE POLICY "Agent isolated carrier_connections UPDATE" ON public.carrier_connections
    FOR UPDATE TO authenticated USING (agent_id = auth.uid() OR public.can_access_agent(agent_id));

DROP POLICY IF EXISTS "Agent isolated carrier_connections DELETE" ON public.carrier_connections;
CREATE POLICY "Agent isolated carrier_connections DELETE" ON public.carrier_connections
    FOR DELETE TO authenticated USING (agent_id = auth.uid() OR public.can_access_agent(agent_id));

-- 2. carrier_sync_runs
DROP POLICY IF EXISTS "Agent isolated carrier_sync_runs SELECT" ON public.carrier_sync_runs;
CREATE POLICY "Agent isolated carrier_sync_runs SELECT" ON public.carrier_sync_runs
    FOR SELECT TO authenticated USING (agent_id = auth.uid() OR public.can_access_agent(agent_id));

DROP POLICY IF EXISTS "Agent isolated carrier_sync_runs INSERT" ON public.carrier_sync_runs;
CREATE POLICY "Agent isolated carrier_sync_runs INSERT" ON public.carrier_sync_runs
    FOR INSERT TO authenticated WITH CHECK (agent_id = auth.uid());

DROP POLICY IF EXISTS "Agent isolated carrier_sync_runs UPDATE" ON public.carrier_sync_runs;
CREATE POLICY "Agent isolated carrier_sync_runs UPDATE" ON public.carrier_sync_runs
    FOR UPDATE TO authenticated USING (agent_id = auth.uid() OR public.can_access_agent(agent_id));

DROP POLICY IF EXISTS "Agent isolated carrier_sync_runs DELETE" ON public.carrier_sync_runs;
CREATE POLICY "Agent isolated carrier_sync_runs DELETE" ON public.carrier_sync_runs
    FOR DELETE TO authenticated USING (agent_id = auth.uid() OR public.can_access_agent(agent_id));

-- 3. carrier_records
DROP POLICY IF EXISTS "Agent isolated carrier_records SELECT" ON public.carrier_records;
CREATE POLICY "Agent isolated carrier_records SELECT" ON public.carrier_records
    FOR SELECT TO authenticated USING (agent_id = auth.uid() OR public.can_access_agent(agent_id));

DROP POLICY IF EXISTS "Agent isolated carrier_records INSERT" ON public.carrier_records;
CREATE POLICY "Agent isolated carrier_records INSERT" ON public.carrier_records
    FOR INSERT TO authenticated WITH CHECK (agent_id = auth.uid());

DROP POLICY IF EXISTS "Agent isolated carrier_records UPDATE" ON public.carrier_records;
CREATE POLICY "Agent isolated carrier_records UPDATE" ON public.carrier_records
    FOR UPDATE TO authenticated USING (agent_id = auth.uid() OR public.can_access_agent(agent_id));

DROP POLICY IF EXISTS "Agent isolated carrier_records DELETE" ON public.carrier_records;
CREATE POLICY "Agent isolated carrier_records DELETE" ON public.carrier_records
    FOR DELETE TO authenticated USING (agent_id = auth.uid() OR public.can_access_agent(agent_id));

-- 4. carrier_client_matches
DROP POLICY IF EXISTS "Agent isolated carrier_client_matches SELECT" ON public.carrier_client_matches;
CREATE POLICY "Agent isolated carrier_client_matches SELECT" ON public.carrier_client_matches
    FOR SELECT TO authenticated USING (agent_id = auth.uid() OR public.can_access_agent(agent_id));

DROP POLICY IF EXISTS "Agent isolated carrier_client_matches INSERT" ON public.carrier_client_matches;
CREATE POLICY "Agent isolated carrier_client_matches INSERT" ON public.carrier_client_matches
    FOR INSERT TO authenticated WITH CHECK (agent_id = auth.uid());

DROP POLICY IF EXISTS "Agent isolated carrier_client_matches UPDATE" ON public.carrier_client_matches;
CREATE POLICY "Agent isolated carrier_client_matches UPDATE" ON public.carrier_client_matches
    FOR UPDATE TO authenticated USING (agent_id = auth.uid() OR public.can_access_agent(agent_id));

DROP POLICY IF EXISTS "Agent isolated carrier_client_matches DELETE" ON public.carrier_client_matches;
CREATE POLICY "Agent isolated carrier_client_matches DELETE" ON public.carrier_client_matches
    FOR DELETE TO authenticated USING (agent_id = auth.uid() OR public.can_access_agent(agent_id));

-- 5. carrier_policy_snapshots
DROP POLICY IF EXISTS "Agent isolated carrier_policy_snapshots SELECT" ON public.carrier_policy_snapshots;
CREATE POLICY "Agent isolated carrier_policy_snapshots SELECT" ON public.carrier_policy_snapshots
    FOR SELECT TO authenticated USING (agent_id = auth.uid() OR public.can_access_agent(agent_id));

DROP POLICY IF EXISTS "Agent isolated carrier_policy_snapshots INSERT" ON public.carrier_policy_snapshots;
CREATE POLICY "Agent isolated carrier_policy_snapshots INSERT" ON public.carrier_policy_snapshots
    FOR INSERT TO authenticated WITH CHECK (agent_id = auth.uid());

DROP POLICY IF EXISTS "Agent isolated carrier_policy_snapshots UPDATE" ON public.carrier_policy_snapshots;
CREATE POLICY "Agent isolated carrier_policy_snapshots UPDATE" ON public.carrier_policy_snapshots
    FOR UPDATE TO authenticated USING (agent_id = auth.uid() OR public.can_access_agent(agent_id));

DROP POLICY IF EXISTS "Agent isolated carrier_policy_snapshots DELETE" ON public.carrier_policy_snapshots;
CREATE POLICY "Agent isolated carrier_policy_snapshots DELETE" ON public.carrier_policy_snapshots
    FOR DELETE TO authenticated USING (agent_id = auth.uid() OR public.can_access_agent(agent_id));

-- 6. carrier_events
DROP POLICY IF EXISTS "Agent isolated carrier_events SELECT" ON public.carrier_events;
CREATE POLICY "Agent isolated carrier_events SELECT" ON public.carrier_events
    FOR SELECT TO authenticated USING (agent_id = auth.uid() OR public.can_access_agent(agent_id));

DROP POLICY IF EXISTS "Agent isolated carrier_events INSERT" ON public.carrier_events;
CREATE POLICY "Agent isolated carrier_events INSERT" ON public.carrier_events
    FOR INSERT TO authenticated WITH CHECK (agent_id = auth.uid());

DROP POLICY IF EXISTS "Agent isolated carrier_events UPDATE" ON public.carrier_events;
CREATE POLICY "Agent isolated carrier_events UPDATE" ON public.carrier_events
    FOR UPDATE TO authenticated USING (agent_id = auth.uid() OR public.can_access_agent(agent_id));

DROP POLICY IF EXISTS "Agent isolated carrier_events DELETE" ON public.carrier_events;
CREATE POLICY "Agent isolated carrier_events DELETE" ON public.carrier_events
    FOR DELETE TO authenticated USING (agent_id = auth.uid() OR public.can_access_agent(agent_id));
