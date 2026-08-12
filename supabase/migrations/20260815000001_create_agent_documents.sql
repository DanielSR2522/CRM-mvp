-- =====================================================================================
-- SmarTrack CRM — Agent Information Documents Schema & RLS
-- File: supabase/migrations/20260815000001_create_agent_documents.sql
-- =====================================================================================

CREATE TABLE IF NOT EXISTS public.agent_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    section_name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    mime_type TEXT,
    size_bytes BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agent_documents ENABLE ROW LEVEL SECURITY;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS agent_documents_agent_id_idx ON public.agent_documents(agent_id);
CREATE INDEX IF NOT EXISTS agent_documents_section_name_idx ON public.agent_documents(section_name);
CREATE INDEX IF NOT EXISTS agent_documents_created_at_idx ON public.agent_documents(created_at);

-- RLS Policies (Owner-only access for agent profiles)
DROP POLICY IF EXISTS "Agents can view their own documents" ON public.agent_documents;
CREATE POLICY "Agents can view their own documents"
    ON public.agent_documents FOR SELECT
    USING (agent_id = auth.uid());

DROP POLICY IF EXISTS "Agents can insert their own documents" ON public.agent_documents;
CREATE POLICY "Agents can insert their own documents"
    ON public.agent_documents FOR INSERT
    WITH CHECK (agent_id = auth.uid());

DROP POLICY IF EXISTS "Agents can update their own documents" ON public.agent_documents;
CREATE POLICY "Agents can update their own documents"
    ON public.agent_documents FOR UPDATE
    USING (agent_id = auth.uid())
    WITH CHECK (agent_id = auth.uid());

DROP POLICY IF EXISTS "Agents can delete their own documents" ON public.agent_documents;
CREATE POLICY "Agents can delete their own documents"
    ON public.agent_documents FOR DELETE
    USING (agent_id = auth.uid());

NOTIFY pgrst, 'reload schema';
