-- Migration: Create client_documents table with owner-only RLS policies
CREATE TABLE IF NOT EXISTS public.client_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES auth.users(id),
    display_name TEXT NOT NULL,
    document_type TEXT NOT NULL,
    description TEXT,
    original_filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    mime_type TEXT,
    size_bytes BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_documents ENABLE ROW LEVEL SECURITY;

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS client_documents_client_id_idx ON public.client_documents(client_id);
CREATE INDEX IF NOT EXISTS client_documents_agent_id_idx ON public.client_documents(agent_id);
CREATE INDEX IF NOT EXISTS client_documents_created_at_idx ON public.client_documents(created_at);

-- RLS POLICIES (STRICTLY OWNER-PRIVATE: GENERAL CLIENT DOCUMENTS)

DROP POLICY IF EXISTS "Agents select client documents owner only" ON public.client_documents;
DROP POLICY IF EXISTS "Agents can select client documents" ON public.client_documents;
CREATE POLICY "Agents select client documents owner only"
    ON public.client_documents FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = client_id
            AND c.agent_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Agents insert client documents owner only" ON public.client_documents;
DROP POLICY IF EXISTS "Agents can insert client documents" ON public.client_documents;
CREATE POLICY "Agents insert client documents owner only"
    ON public.client_documents FOR INSERT
    TO authenticated
    WITH CHECK (
        agent_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = client_id
            AND c.agent_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Agents update client documents owner only" ON public.client_documents;
DROP POLICY IF EXISTS "Agents can update client documents" ON public.client_documents;
CREATE POLICY "Agents update client documents owner only"
    ON public.client_documents FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = client_id
            AND c.agent_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = client_id
            AND c.agent_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Agents delete client documents owner only" ON public.client_documents;
DROP POLICY IF EXISTS "Agents can delete client documents" ON public.client_documents;
CREATE POLICY "Agents delete client documents owner only"
    ON public.client_documents FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = client_id
            AND c.agent_id = auth.uid()
        )
    );
