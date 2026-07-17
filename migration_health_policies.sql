-- =============================================
-- Health Policies Migration (Non-Destructive)
-- =============================================

-- 0. TRIGGER FUNCTION FOR UPDATED_AT
-- =============================================
CREATE OR REPLACE FUNCTION public.health_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. HEALTH POLICIES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.health_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE UNIQUE, -- Garantiza MÁXIMO 1 póliza Health por cliente
    active BOOLEAN NOT NULL DEFAULT TRUE,
    year_renovation INTEGER,
    policy_status TEXT CHECK (policy_status IN ('Active', 'Pending', 'Cancelled')),
    action_pending TEXT CHECK (action_pending IN ('Documents', 'Verification', 'Call To Marketplace', 'Completed')),
    renovation_status TEXT CHECK (renovation_status IN ('New Policy 2026', 'Renewal 2026', 'Only Service')),
    npn TEXT,
    company_2026 TEXT,
    application_number TEXT,
    type_plan TEXT CHECK (type_plan IS NULL OR type_plan IN ('Bronze', 'Silver', 'Gold', 'Platinum', 'Catastrophic')),
    marketplace_account BOOLEAN DEFAULT FALSE,
    plan_id TEXT,
    plan_name TEXT,
    no_membership TEXT,
    plan_cost NUMERIC(10,2) DEFAULT 0.00,
    tax_credit NUMERIC(10,2) DEFAULT 0.00,
    effective_date DATE,
    coverage_members_count INTEGER CHECK (coverage_members_count IS NULL OR (coverage_members_count BETWEEN 1 AND 7)),
    primary_doctor TEXT,
    primary_doctor_address TEXT,
    primary_doctor_phone TEXT,
    hospital TEXT,
    urgent_care TEXT,
    pharmacy TEXT,
    conditions TEXT,
    medicines TEXT,
    specialist TEXT,
    
    -- Publicly readable presence indicators for encrypted secrets
    has_user_name BOOLEAN NOT NULL DEFAULT FALSE,
    has_password_val BOOLEAN NOT NULL DEFAULT FALSE,
    has_security_question BOOLEAN NOT NULL DEFAULT FALSE,
    has_company_user BOOLEAN NOT NULL DEFAULT FALSE,
    has_company_password BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.health_policies ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS health_policies_client_id_idx ON public.health_policies(client_id);

-- RLS policies for health_policies
DO $$
BEGIN
    -- SELECT
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'health_policies' AND policyname = 'Agents can select health policies of their clients'
    ) THEN
        CREATE POLICY "Agents can select health policies of their clients" ON public.health_policies
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM public.clients c
                WHERE c.id = health_policies.client_id AND c.agent_id = auth.uid()
            )
        );
    END IF;

    -- INSERT
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'health_policies' AND policyname = 'Agents can insert health policies for their clients'
    ) THEN
        CREATE POLICY "Agents can insert health policies for their clients" ON public.health_policies
        FOR INSERT WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.clients c
                WHERE c.id = health_policies.client_id AND c.agent_id = auth.uid()
            )
        );
    END IF;

    -- UPDATE
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'health_policies' AND policyname = 'Agents can update health policies of their clients'
    ) THEN
        CREATE POLICY "Agents can update health policies of their clients" ON public.health_policies
        FOR UPDATE USING (
            EXISTS (
                SELECT 1 FROM public.clients c
                WHERE c.id = health_policies.client_id AND c.agent_id = auth.uid()
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.clients c
                WHERE c.id = health_policies.client_id AND c.agent_id = auth.uid()
            )
        );
    END IF;

    -- DELETE
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'health_policies' AND policyname = 'Agents can delete health policies of their clients'
    ) THEN
        CREATE POLICY "Agents can delete health policies of their clients" ON public.health_policies
        FOR DELETE USING (
            EXISTS (
                SELECT 1 FROM public.clients c
                WHERE c.id = health_policies.client_id AND c.agent_id = auth.uid()
            )
        );
    END IF;
END $$;

-- Trigger for updated_at on health_policies
DROP TRIGGER IF EXISTS health_policies_set_updated_at_trg ON public.health_policies;
CREATE TRIGGER health_policies_set_updated_at_trg
BEFORE UPDATE ON public.health_policies
FOR EACH ROW
EXECUTE FUNCTION public.health_set_updated_at();


-- 2. HEALTH POLICY SECRETS TABLE (Service-Role Only)
-- =============================================
CREATE TABLE IF NOT EXISTS public.health_policy_secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    health_policy_id UUID NOT NULL UNIQUE REFERENCES public.health_policies(id) ON DELETE CASCADE,
    
    user_name_ciphertext TEXT,
    user_name_iv TEXT,
    user_name_auth_tag TEXT,
    
    password_ciphertext TEXT,
    password_iv TEXT,
    password_auth_tag TEXT,
    
    security_question_ciphertext TEXT,
    security_question_iv TEXT,
    security_question_auth_tag TEXT,
    
    company_user_ciphertext TEXT,
    company_user_iv TEXT,
    company_user_auth_tag TEXT,
    
    company_password_ciphertext TEXT,
    company_password_iv TEXT,
    company_password_auth_tag TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on secrets table, but define NO policies for authenticated/anon users.
-- This restricts reading and writing strictly to the service_role client.
ALTER TABLE public.health_policy_secrets ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS health_policy_secrets_policy_idx ON public.health_policy_secrets(health_policy_id);

-- Trigger for updated_at on health_policy_secrets
DROP TRIGGER IF EXISTS health_policy_secrets_set_updated_at_trg ON public.health_policy_secrets;
CREATE TRIGGER health_policy_secrets_set_updated_at_trg
BEFORE UPDATE ON public.health_policy_secrets
FOR EACH ROW
EXECUTE FUNCTION public.health_set_updated_at();


-- 3. HEALTH NOTES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.health_policy_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    health_policy_id UUID NOT NULL REFERENCES public.health_policies(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES auth.users(id),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.health_policy_notes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS health_policy_notes_policy_idx ON public.health_policy_notes(health_policy_id);

-- RLS policies for health_policy_notes
DO $$
BEGIN
    -- SELECT
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'health_policy_notes' AND policyname = 'Agents can select notes of their health policies'
    ) THEN
        CREATE POLICY "Agents can select notes of their health policies" ON public.health_policy_notes
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM public.health_policies hp
                JOIN public.clients c ON hp.client_id = c.id
                WHERE hp.id = health_policy_notes.health_policy_id AND c.agent_id = auth.uid()
            )
        );
    END IF;

    -- INSERT
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'health_policy_notes' AND policyname = 'Agents can insert notes for their health policies'
    ) THEN
        CREATE POLICY "Agents can insert notes for their health policies" ON public.health_policy_notes
        FOR INSERT WITH CHECK (
            author_id = auth.uid() AND
            EXISTS (
                SELECT 1 FROM public.health_policies hp
                JOIN public.clients c ON hp.client_id = c.id
                WHERE hp.id = health_policy_notes.health_policy_id AND c.agent_id = auth.uid()
            )
        );
    END IF;

    -- UPDATE
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'health_policy_notes' AND policyname = 'Agents can update health notes they authored'
    ) THEN
        CREATE POLICY "Agents can update health notes they authored" ON public.health_policy_notes
        FOR UPDATE USING (
            author_id = auth.uid() AND
            EXISTS (
                SELECT 1 FROM public.health_policies hp
                JOIN public.clients c ON hp.client_id = c.id
                WHERE hp.id = health_policy_notes.health_policy_id AND c.agent_id = auth.uid()
            )
        )
        WITH CHECK (
            author_id = auth.uid() AND
            EXISTS (
                SELECT 1 FROM public.health_policies hp
                JOIN public.clients c ON hp.client_id = c.id
                WHERE hp.id = health_policy_notes.health_policy_id AND c.agent_id = auth.uid()
            )
        );
    END IF;

    -- DELETE
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'health_policy_notes' AND policyname = 'Agents can delete health notes they authored'
    ) THEN
        CREATE POLICY "Agents can delete health notes they authored" ON public.health_policy_notes
        FOR DELETE USING (
            author_id = auth.uid() AND
            EXISTS (
                SELECT 1 FROM public.health_policies hp
                JOIN public.clients c ON hp.client_id = c.id
                WHERE hp.id = health_policy_notes.health_policy_id AND c.agent_id = auth.uid()
            )
        );
    END IF;
END $$;

-- Trigger for updated_at on health_policy_notes
DROP TRIGGER IF EXISTS health_policy_notes_set_updated_at_trg ON public.health_policy_notes;
CREATE TRIGGER health_policy_notes_set_updated_at_trg
BEFORE UPDATE ON public.health_policy_notes
FOR EACH ROW
EXECUTE FUNCTION public.health_set_updated_at();


-- 4. HEALTH DOCUMENT SECTIONS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.health_policy_document_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    health_policy_id UUID NOT NULL REFERENCES public.health_policies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.health_policy_document_sections ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS health_policy_doc_sections_policy_idx ON public.health_policy_document_sections(health_policy_id);

-- RLS policies for health_policy_document_sections
DO $$
BEGIN
    -- SELECT
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'health_policy_document_sections' AND policyname = 'Agents can select document sections of their health policies'
    ) THEN
        CREATE POLICY "Agents can select document sections of their health policies" ON public.health_policy_document_sections
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM public.health_policies hp
                JOIN public.clients c ON hp.client_id = c.id
                WHERE hp.id = health_policy_document_sections.health_policy_id AND c.agent_id = auth.uid()
            )
        );
    END IF;

    -- INSERT
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'health_policy_document_sections' AND policyname = 'Agents can insert document sections for their health policies'
    ) THEN
        CREATE POLICY "Agents can insert document sections for their health policies" ON public.health_policy_document_sections
        FOR INSERT WITH CHECK (
            created_by = auth.uid() AND
            EXISTS (
                SELECT 1 FROM public.health_policies hp
                JOIN public.clients c ON hp.client_id = c.id
                WHERE hp.id = health_policy_document_sections.health_policy_id AND c.agent_id = auth.uid()
            )
        );
    END IF;

    -- UPDATE
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'health_policy_document_sections' AND policyname = 'Agents can update document sections of their health policies'
    ) THEN
        CREATE POLICY "Agents can update document sections of their health policies" ON public.health_policy_document_sections
        FOR UPDATE USING (
            EXISTS (
                SELECT 1 FROM public.health_policies hp
                JOIN public.clients c ON hp.client_id = c.id
                WHERE hp.id = health_policy_document_sections.health_policy_id AND c.agent_id = auth.uid()
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.health_policies hp
                JOIN public.clients c ON hp.client_id = c.id
                WHERE hp.id = health_policy_document_sections.health_policy_id AND c.agent_id = auth.uid()
            )
        );
    END IF;

    -- DELETE
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'health_policy_document_sections' AND policyname = 'Agents can delete document sections of their health policies'
    ) THEN
        CREATE POLICY "Agents can delete document sections of their health policies" ON public.health_policy_document_sections
        FOR DELETE USING (
            EXISTS (
                SELECT 1 FROM public.health_policies hp
                JOIN public.clients c ON hp.client_id = c.id
                WHERE hp.id = health_policy_document_sections.health_policy_id AND c.agent_id = auth.uid()
            )
        );
    END IF;
END $$;

-- Trigger for updated_at on health_policy_document_sections
DROP TRIGGER IF EXISTS health_policy_document_sections_set_updated_at_trg ON public.health_policy_document_sections;
CREATE TRIGGER health_policy_document_sections_set_updated_at_trg
BEFORE UPDATE ON public.health_policy_document_sections
FOR EACH ROW
EXECUTE FUNCTION public.health_set_updated_at();


-- 5. HEALTH DOCUMENTS METADATA TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.health_policy_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    health_policy_id UUID NOT NULL REFERENCES public.health_policies(id) ON DELETE CASCADE,
    section_id UUID NOT NULL REFERENCES public.health_policy_document_sections(id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL REFERENCES auth.users(id),
    display_name TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    storage_path TEXT NOT NULL UNIQUE,
    mime_type TEXT,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.health_policy_documents ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS health_policy_docs_policy_idx ON public.health_policy_documents(health_policy_id);
CREATE INDEX IF NOT EXISTS health_policy_docs_section_idx ON public.health_policy_documents(section_id);

-- Consistency Trigger: check section_id belongs to the same health_policy_id
CREATE OR REPLACE FUNCTION public.check_health_document_section_policy_match()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.health_policy_document_sections
        WHERE id = NEW.section_id AND health_policy_id = NEW.health_policy_id
    ) THEN
        RAISE EXCEPTION 'Document section_id does not belong to the selected health_policy_id';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_health_doc_section_policy_match_trg ON public.health_policy_documents;
CREATE TRIGGER check_health_doc_section_policy_match_trg
BEFORE INSERT OR UPDATE ON public.health_policy_documents
FOR EACH ROW
EXECUTE FUNCTION public.check_health_document_section_policy_match();

-- RLS policies for health_policy_documents
DO $$
BEGIN
    -- SELECT
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'health_policy_documents' AND policyname = 'Agents can select documents of their health policies'
    ) THEN
        CREATE POLICY "Agents can select documents of their health policies" ON public.health_policy_documents
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM public.health_policies hp
                JOIN public.clients c ON hp.client_id = c.id
                WHERE hp.id = health_policy_documents.health_policy_id AND c.agent_id = auth.uid()
            )
        );
    END IF;

    -- INSERT
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'health_policy_documents' AND policyname = 'Agents can insert documents for their health policies'
    ) THEN
        CREATE POLICY "Agents can insert documents for their health policies" ON public.health_policy_documents
        FOR INSERT WITH CHECK (
            uploaded_by = auth.uid() AND
            EXISTS (
                SELECT 1 FROM public.health_policies hp
                JOIN public.clients c ON hp.client_id = c.id
                WHERE hp.id = health_policy_documents.health_policy_id AND c.agent_id = auth.uid()
            )
        );
    END IF;

    -- UPDATE
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'health_policy_documents' AND policyname = 'Agents can update documents of their health policies'
    ) THEN
        CREATE POLICY "Agents can update documents of their health policies" ON public.health_policy_documents
        FOR UPDATE USING (
            EXISTS (
                SELECT 1 FROM public.health_policies hp
                JOIN public.clients c ON hp.client_id = c.id
                WHERE hp.id = health_policy_documents.health_policy_id AND c.agent_id = auth.uid()
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.health_policies hp
                JOIN public.clients c ON hp.client_id = c.id
                WHERE hp.id = health_policy_documents.health_policy_id AND c.agent_id = auth.uid()
            )
            AND EXISTS (
                SELECT 1 FROM public.health_policy_document_sections hds
                WHERE hds.id = health_policy_documents.section_id AND hds.health_policy_id = health_policy_documents.health_policy_id
            )
        );
    END IF;

    -- DELETE
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'health_policy_documents' AND policyname = 'Agents can delete documents of their health policies'
    ) THEN
        CREATE POLICY "Agents can delete documents of their health policies" ON public.health_policy_documents
        FOR DELETE USING (
            EXISTS (
                SELECT 1 FROM public.health_policies hp
                JOIN public.clients c ON hp.client_id = c.id
                WHERE hp.id = health_policy_documents.health_policy_id AND c.agent_id = auth.uid()
            )
        );
    END IF;
END $$;

-- Trigger for updated_at ON health_policy_documents
DROP TRIGGER IF EXISTS health_policy_documents_set_updated_at_trg ON public.health_policy_documents;
CREATE TRIGGER health_policy_documents_set_updated_at_trg
BEFORE UPDATE ON public.health_policy_documents
FOR EACH ROW
EXECUTE FUNCTION public.health_set_updated_at();


-- 6. HEALTH NOTE ATTACHMENTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.health_policy_note_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id UUID NOT NULL REFERENCES public.health_policy_notes(id) ON DELETE CASCADE,
    health_policy_id UUID NOT NULL REFERENCES public.health_policies(id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL REFERENCES auth.users(id),
    display_name TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    storage_path TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.health_policy_note_attachments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS health_policy_note_att_note_idx ON public.health_policy_note_attachments(note_id);
CREATE INDEX IF NOT EXISTS health_policy_note_att_policy_idx ON public.health_policy_note_attachments(health_policy_id);

-- Consistency Trigger: check note_id belongs to the same health_policy_id (runs BEFORE INSERT OR UPDATE)
CREATE OR REPLACE FUNCTION public.check_health_note_attachment_policy_match()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.health_policy_notes
        WHERE id = NEW.note_id AND health_policy_id = NEW.health_policy_id
    ) THEN
        RAISE EXCEPTION 'Attachment note_id does not belong to the specified health_policy_id';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_health_note_attachment_policy_match_trg ON public.health_policy_note_attachments;
CREATE TRIGGER check_health_note_attachment_policy_match_trg
BEFORE INSERT OR UPDATE ON public.health_policy_note_attachments
FOR EACH ROW
EXECUTE FUNCTION public.check_health_note_attachment_policy_match();

-- RLS policies for health_policy_note_attachments
DO $$
BEGIN
    -- SELECT
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'health_policy_note_attachments' AND policyname = 'Agents can select note attachments of their health policies'
    ) THEN
        CREATE POLICY "Agents can select note attachments of their health policies" ON public.health_policy_note_attachments
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM public.health_policies hp
                JOIN public.clients c ON hp.client_id = c.id
                WHERE hp.id = health_policy_note_attachments.health_policy_id AND c.agent_id = auth.uid()
            )
        );
    END IF;

    -- INSERT
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'health_policy_note_attachments' AND policyname = 'Agents can insert note attachments for their health policies'
    ) THEN
        CREATE POLICY "Agents can insert note attachments for their health policies" ON public.health_policy_note_attachments
        FOR INSERT WITH CHECK (
            uploaded_by = auth.uid() AND
            EXISTS (
                SELECT 1 FROM public.health_policies hp
                JOIN public.clients c ON hp.client_id = c.id
                WHERE hp.id = health_policy_note_attachments.health_policy_id AND c.agent_id = auth.uid()
            )
        );
    END IF;

    -- DELETE
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'health_policy_note_attachments' AND policyname = 'Agents can delete note attachments of their health policies'
    ) THEN
        CREATE POLICY "Agents can delete note attachments of their health policies" ON public.health_policy_note_attachments
        FOR DELETE USING (
            EXISTS (
                SELECT 1 FROM public.health_policies hp
                JOIN public.clients c ON hp.client_id = c.id
                WHERE hp.id = health_policy_note_attachments.health_policy_id AND c.agent_id = auth.uid()
            )
        );
    END IF;
END $$;


-- 7. PRIVATE STORAGE CONFIGURATION
-- =============================================
-- Create bucket if not exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('health-policy-documents', 'health-policy-documents', false, 20971520, NULL) -- 20 MB Limit
ON CONFLICT (id) DO NOTHING;

-- RLS policies for storage.objects under health-policy-documents bucket
DO $$
BEGIN
    -- SELECT
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Agents can select health policy documents in their folder'
    ) THEN
        CREATE POLICY "Agents can select health policy documents in their folder" ON storage.objects
        FOR SELECT TO authenticated
        USING (
            bucket_id = 'health-policy-documents' AND
            split_part(name, '/', 1) = auth.uid()::text AND
            EXISTS (
                SELECT 1 FROM public.clients c
                JOIN public.health_policies hp ON hp.client_id = c.id
                WHERE c.id::text = split_part(name, '/', 2)
                  AND c.agent_id = auth.uid()
                  AND hp.id::text = split_part(name, '/', 3)
            )
        );
    END IF;

    -- INSERT
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Agents can insert health policy documents in their folder'
    ) THEN
        CREATE POLICY "Agents can insert health policy documents in their folder" ON storage.objects
        FOR INSERT TO authenticated
        WITH CHECK (
            bucket_id = 'health-policy-documents' AND
            split_part(name, '/', 1) = auth.uid()::text AND
            EXISTS (
                SELECT 1 FROM public.clients c
                JOIN public.health_policies hp ON hp.client_id = c.id
                WHERE c.id::text = split_part(name, '/', 2)
                  AND c.agent_id = auth.uid()
                  AND hp.id::text = split_part(name, '/', 3)
            )
        );
    END IF;

    -- UPDATE
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Agents can update health policy documents in their folder'
    ) THEN
        CREATE POLICY "Agents can update health policy documents in their folder" ON storage.objects
        FOR UPDATE TO authenticated
        USING (
            bucket_id = 'health-policy-documents' AND
            split_part(name, '/', 1) = auth.uid()::text AND
            EXISTS (
                SELECT 1 FROM public.clients c
                JOIN public.health_policies hp ON hp.client_id = c.id
                WHERE c.id::text = split_part(name, '/', 2)
                  AND c.agent_id = auth.uid()
                  AND hp.id::text = split_part(name, '/', 3)
            )
        )
        WITH CHECK (
            bucket_id = 'health-policy-documents' AND
            split_part(name, '/', 1) = auth.uid()::text AND
            EXISTS (
                SELECT 1 FROM public.clients c
                JOIN public.health_policies hp ON hp.client_id = c.id
                WHERE c.id::text = split_part(name, '/', 2)
                  AND c.agent_id = auth.uid()
                  AND hp.id::text = split_part(name, '/', 3)
            )
        );
    END IF;

    -- DELETE
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Agents can delete health policy documents in their folder'
    ) THEN
        CREATE POLICY "Agents can delete health policy documents in their folder" ON storage.objects
        FOR DELETE TO authenticated
        USING (
            bucket_id = 'health-policy-documents' AND
            split_part(name, '/', 1) = auth.uid()::text AND
            EXISTS (
                SELECT 1 FROM public.clients c
                JOIN public.health_policies hp ON hp.client_id = c.id
                WHERE c.id::text = split_part(name, '/', 2)
                  AND c.agent_id = auth.uid()
                  AND hp.id::text = split_part(name, '/', 3)
            )
        );
    END IF;
END $$;
