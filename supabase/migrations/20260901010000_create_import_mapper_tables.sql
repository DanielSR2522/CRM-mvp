-- Universal Import Mapper metadata.
-- Additive only: stores reusable column mappings and import run audit history.

CREATE TABLE IF NOT EXISTS public.import_mapping_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    source_fingerprint TEXT,
    mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT import_mapping_templates_agent_name_key UNIQUE (agent_id, name)
);

CREATE TABLE IF NOT EXISTS public.import_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    mapping_template_id UUID REFERENCES public.import_mapping_templates(id) ON DELETE SET NULL,
    filename TEXT NOT NULL,
    source_type TEXT NOT NULL,
    mapping_used JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'draft',
    rows_processed INTEGER NOT NULL DEFAULT 0,
    created_count INTEGER NOT NULL DEFAULT 0,
    updated_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
    errors JSONB NOT NULL DEFAULT '[]'::jsonb,
    import_plan JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_import_mapping_templates_agent
    ON public.import_mapping_templates(agent_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_runs_agent
    ON public.import_runs(agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_runs_imported_by
    ON public.import_runs(imported_by, created_at DESC);

ALTER TABLE public.import_mapping_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Import mapping templates select accessible agents"
    ON public.import_mapping_templates FOR SELECT
    TO authenticated
    USING (public.can_access_agent(agent_id, 'property_casualty'));

CREATE POLICY "Import mapping templates insert accessible agents"
    ON public.import_mapping_templates FOR INSERT
    TO authenticated
    WITH CHECK (public.can_access_agent(agent_id, 'property_casualty'));

CREATE POLICY "Import mapping templates update accessible agents"
    ON public.import_mapping_templates FOR UPDATE
    TO authenticated
    USING (public.can_access_agent(agent_id, 'property_casualty'))
    WITH CHECK (public.can_access_agent(agent_id, 'property_casualty'));

CREATE POLICY "Import mapping templates delete accessible agents"
    ON public.import_mapping_templates FOR DELETE
    TO authenticated
    USING (public.can_access_agent(agent_id, 'property_casualty'));

CREATE POLICY "Import runs select accessible agents"
    ON public.import_runs FOR SELECT
    TO authenticated
    USING (public.can_access_agent(agent_id, 'property_casualty'));

CREATE POLICY "Import runs insert accessible agents"
    ON public.import_runs FOR INSERT
    TO authenticated
    WITH CHECK (public.can_access_agent(agent_id, 'property_casualty'));

CREATE POLICY "Import runs update accessible agents"
    ON public.import_runs FOR UPDATE
    TO authenticated
    USING (public.can_access_agent(agent_id, 'property_casualty'))
    WITH CHECK (public.can_access_agent(agent_id, 'property_casualty'));

CREATE POLICY "Import runs delete accessible agents"
    ON public.import_runs FOR DELETE
    TO authenticated
    USING (public.can_access_agent(agent_id, 'property_casualty'));
