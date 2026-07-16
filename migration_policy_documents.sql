-- =============================================
-- Policy Documents Migration (Non-Destructive)
-- =============================================

-- 1. POLICY DOCUMENT SECTIONS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS public.policy_document_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id UUID NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.policy_document_sections ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS policy_document_sections_policy_id_idx ON public.policy_document_sections(policy_id);
CREATE INDEX IF NOT EXISTS policy_document_sections_position_idx ON public.policy_document_sections(position);

-- Limit trigger for max 10 sections per policy
CREATE OR REPLACE FUNCTION public.check_policy_sections_limit()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT COUNT(*) FROM public.policy_document_sections WHERE policy_id = NEW.policy_id) >= 10 THEN
        RAISE EXCEPTION 'A policy cannot have more than 10 document sections';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_sections_limit_trg ON public.policy_document_sections;
CREATE TRIGGER check_sections_limit_trg
BEFORE INSERT ON public.policy_document_sections
FOR EACH ROW
EXECUTE FUNCTION public.check_policy_sections_limit();

-- RLS policies for policy_document_sections
DO $$
BEGIN
    -- SELECT
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'policy_document_sections' AND policyname = 'Agents can select sections of their policies'
    ) THEN
        CREATE POLICY "Agents can select sections of their policies" ON public.policy_document_sections
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM public.policies p
                JOIN public.clients c ON p.client_id = c.id
                WHERE p.id = policy_document_sections.policy_id AND c.agent_id = auth.uid()
            )
        );
    END IF;

    -- INSERT
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'policy_document_sections' AND policyname = 'Agents can insert sections for their policies'
    ) THEN
        CREATE POLICY "Agents can insert sections for their policies" ON public.policy_document_sections
        FOR INSERT WITH CHECK (
            created_by = auth.uid() AND
            EXISTS (
                SELECT 1 FROM public.policies p
                JOIN public.clients c ON p.client_id = c.id
                WHERE p.id = policy_document_sections.policy_id AND c.agent_id = auth.uid()
            )
        );
    END IF;

    -- UPDATE (WITH CHECK ensures the updated row still belongs to the agent)
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'policy_document_sections' AND policyname = 'Agents can update sections of their policies'
    ) THEN
        CREATE POLICY "Agents can update sections of their policies" ON public.policy_document_sections
        FOR UPDATE USING (
            EXISTS (
                SELECT 1 FROM public.policies p
                JOIN public.clients c ON p.client_id = c.id
                WHERE p.id = policy_document_sections.policy_id AND c.agent_id = auth.uid()
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.policies p
                JOIN public.clients c ON p.client_id = c.id
                WHERE p.id = policy_document_sections.policy_id AND c.agent_id = auth.uid()
            )
        );
    END IF;

    -- DELETE
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'policy_document_sections' AND policyname = 'Agents can delete sections of their policies'
    ) THEN
        CREATE POLICY "Agents can delete sections of their policies" ON public.policy_document_sections
        FOR DELETE USING (
            EXISTS (
                SELECT 1 FROM public.policies p
                JOIN public.clients c ON p.client_id = c.id
                WHERE p.id = policy_document_sections.policy_id AND c.agent_id = auth.uid()
            )
        );
    END IF;
END $$;

-- 2. POLICY DOCUMENTS METADATA TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS public.policy_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id UUID NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
    section_id UUID NOT NULL REFERENCES public.policy_document_sections(id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL REFERENCES auth.users(id),
    display_name TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    storage_path TEXT NOT NULL UNIQUE,
    mime_type TEXT,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.policy_documents ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS policy_documents_policy_id_idx ON public.policy_documents(policy_id);
CREATE INDEX IF NOT EXISTS policy_documents_section_id_idx ON public.policy_documents(section_id);
CREATE INDEX IF NOT EXISTS policy_documents_created_at_idx ON public.policy_documents(created_at);

-- Trigger to check section_id belongs to the same policy_id
CREATE OR REPLACE FUNCTION public.check_document_section_policy_match()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.policy_document_sections
        WHERE id = NEW.section_id AND policy_id = NEW.policy_id
    ) THEN
        RAISE EXCEPTION 'Document section_id does not belong to the selected policy_id';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_doc_section_policy_match_trg ON public.policy_documents;
CREATE TRIGGER check_doc_section_policy_match_trg
BEFORE INSERT OR UPDATE ON public.policy_documents
FOR EACH ROW
EXECUTE FUNCTION public.check_document_section_policy_match();

-- RLS policies for policy_documents
DO $$
BEGIN
    -- SELECT
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'policy_documents' AND policyname = 'Agents can select documents of their policies'
    ) THEN
        CREATE POLICY "Agents can select documents of their policies" ON public.policy_documents
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM public.policies p
                JOIN public.clients c ON p.client_id = c.id
                WHERE p.id = policy_documents.policy_id AND c.agent_id = auth.uid()
            )
        );
    END IF;

    -- INSERT
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'policy_documents' AND policyname = 'Agents can insert documents for their policies'
    ) THEN
        CREATE POLICY "Agents can insert documents for their policies" ON public.policy_documents
        FOR INSERT WITH CHECK (
            uploaded_by = auth.uid() AND
            EXISTS (
                SELECT 1 FROM public.policies p
                JOIN public.clients c ON p.client_id = c.id
                WHERE p.id = policy_documents.policy_id AND c.agent_id = auth.uid()
            )
        );
    END IF;

    -- UPDATE (WITH CHECK ensures updated row still belongs to the agent and section_id matches policy_id)
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'policy_documents' AND policyname = 'Agents can update documents of their policies'
    ) THEN
        CREATE POLICY "Agents can update documents of their policies" ON public.policy_documents
        FOR UPDATE USING (
            EXISTS (
                SELECT 1 FROM public.policies p
                JOIN public.clients c ON p.client_id = c.id
                WHERE p.id = policy_documents.policy_id AND c.agent_id = auth.uid()
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.policies p
                JOIN public.clients c ON p.client_id = c.id
                WHERE p.id = policy_documents.policy_id AND c.agent_id = auth.uid()
            )
            AND EXISTS (
                SELECT 1 FROM public.policy_document_sections pds
                WHERE pds.id = policy_documents.section_id AND pds.policy_id = policy_documents.policy_id
            )
        );
    END IF;

    -- DELETE
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'policy_documents' AND policyname = 'Agents can delete documents of their policies'
    ) THEN
        CREATE POLICY "Agents can delete documents of their policies" ON public.policy_documents
        FOR DELETE USING (
            EXISTS (
                SELECT 1 FROM public.policies p
                JOIN public.clients c ON p.client_id = c.id
                WHERE p.id = policy_documents.policy_id AND c.agent_id = auth.uid()
            )
        );
    END IF;
END $$;

-- 3. PRIVATE STORAGE BUCKET
-- =============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'policy-documents',
    'policy-documents',
    FALSE,
    20971520,
    ARRAY[
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv',
        'text/plain',
        'image/jpeg',
        'image/png',
        'image/webp'
    ]
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 4. GRANULAR STORAGE RLS POLICIES (bucket-scoped unique names)
-- =============================================

DO $$
BEGIN
    -- SELECT
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'policy_documents_storage_select'
    ) THEN
        CREATE POLICY "policy_documents_storage_select" ON storage.objects
        FOR SELECT TO authenticated
        USING (
            bucket_id = 'policy-documents' AND
            auth.uid()::text = split_part(name, '/', 1)
        );
    END IF;

    -- INSERT
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'policy_documents_storage_insert'
    ) THEN
        CREATE POLICY "policy_documents_storage_insert" ON storage.objects
        FOR INSERT TO authenticated
        WITH CHECK (
            bucket_id = 'policy-documents' AND
            auth.uid()::text = split_part(name, '/', 1)
        );
    END IF;

    -- UPDATE
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'policy_documents_storage_update'
    ) THEN
        CREATE POLICY "policy_documents_storage_update" ON storage.objects
        FOR UPDATE TO authenticated
        USING (
            bucket_id = 'policy-documents' AND
            auth.uid()::text = split_part(name, '/', 1)
        )
        WITH CHECK (
            bucket_id = 'policy-documents' AND
            auth.uid()::text = split_part(name, '/', 1)
        );
    END IF;

    -- DELETE
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'policy_documents_storage_delete'
    ) THEN
        CREATE POLICY "policy_documents_storage_delete" ON storage.objects
        FOR DELETE TO authenticated
        USING (
            bucket_id = 'policy-documents' AND
            auth.uid()::text = split_part(name, '/', 1)
        );
    END IF;
END $$;
