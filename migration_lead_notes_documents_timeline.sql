-- =====================================================================================
-- SmarTrack CRM — Leads Module Phase 2 Migration (Audited & Hardened)
-- File:    migration_lead_notes_documents_timeline.sql
--
-- WHAT THIS MIGRATION DOES:
--   1. Creates `public.lead_notes` for cascading parent/child notes with composite ownership triggers.
--   2. Creates `public.lead_note_attachments` for file attachments inside notes with strict lead & agent triggers.
--   3. Creates `public.lead_documents` for dedicated document management.
--   4. Creates `public.lead_timeline_events` and a server-verified `log_lead_timeline_event` RPC.
--   5. Configures triggers to automatically update `public.leads.last_activity_at`.
--   6. Backfills `lead_created` timeline events idempotently for existing leads.
--   7. Configures private Storage bucket `lead-files` and idempotent storage RLS policies.
-- =====================================================================================

-- 1. LEAD NOTES TABLE
-- =====================================================================================
CREATE TABLE IF NOT EXISTS public.lead_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    parent_note_id UUID NULL REFERENCES public.lead_notes(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT lead_notes_body_check CHECK (length(trim(body)) > 0)
);

ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS lead_notes_lead_id_idx ON public.lead_notes(lead_id);
CREATE INDEX IF NOT EXISTS lead_notes_agent_id_idx ON public.lead_notes(agent_id);
CREATE INDEX IF NOT EXISTS lead_notes_parent_note_id_idx ON public.lead_notes(parent_note_id);
CREATE INDEX IF NOT EXISTS lead_notes_created_at_idx ON public.lead_notes(created_at);

-- Parent Note Lead & Agent Ownership Validation Trigger
CREATE OR REPLACE FUNCTION public.check_lead_note_parent_match()
RETURNS TRIGGER AS $$
DECLARE
    v_lead_agent_id UUID;
    v_parent_lead_id UUID;
    v_parent_agent_id UUID;
BEGIN
    -- Verify lead_id belongs to agent_id
    SELECT agent_id INTO v_lead_agent_id
    FROM public.leads
    WHERE id = NEW.lead_id;

    IF v_lead_agent_id IS NULL OR v_lead_agent_id <> NEW.agent_id THEN
        RAISE EXCEPTION 'agent_id does not match the lead owner.';
    END IF;

    -- Verify parent_note_id belongs to the same lead and agent
    IF NEW.parent_note_id IS NOT NULL THEN
        SELECT lead_id, agent_id INTO v_parent_lead_id, v_parent_agent_id
        FROM public.lead_notes
        WHERE id = NEW.parent_note_id;

        IF v_parent_lead_id IS NULL OR v_parent_lead_id <> NEW.lead_id THEN
            RAISE EXCEPTION 'Parent note does not belong to the specified lead.';
        END IF;

        IF v_parent_agent_id <> NEW.agent_id THEN
            RAISE EXCEPTION 'Parent note belongs to another agent.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_lead_note_parent_match_trg ON public.lead_notes;
CREATE TRIGGER check_lead_note_parent_match_trg
    BEFORE INSERT OR UPDATE ON public.lead_notes
    FOR EACH ROW
    EXECUTE FUNCTION public.check_lead_note_parent_match();

-- Lead Notes RLS Policies (Idempotent)
DO $$
BEGIN
    DROP POLICY IF EXISTS "Agents can select notes of their leads" ON public.lead_notes;
    CREATE POLICY "Agents can select notes of their leads" ON public.lead_notes
        FOR SELECT TO authenticated
        USING (agent_id = auth.uid());

    DROP POLICY IF EXISTS "Agents can insert notes for their leads" ON public.lead_notes;
    CREATE POLICY "Agents can insert notes for their leads" ON public.lead_notes
        FOR INSERT TO authenticated
        WITH CHECK (
            agent_id = auth.uid() AND
            EXISTS (SELECT 1 FROM public.leads WHERE id = lead_notes.lead_id AND agent_id = auth.uid())
        );

    DROP POLICY IF EXISTS "Agents can update notes of their leads" ON public.lead_notes;
    CREATE POLICY "Agents can update notes of their leads" ON public.lead_notes
        FOR UPDATE TO authenticated
        USING (agent_id = auth.uid())
        WITH CHECK (
            agent_id = auth.uid() AND
            EXISTS (SELECT 1 FROM public.leads WHERE id = lead_notes.lead_id AND agent_id = auth.uid())
        );

    DROP POLICY IF EXISTS "Agents can delete notes of their leads" ON public.lead_notes;
    CREATE POLICY "Agents can delete notes of their leads" ON public.lead_notes
        FOR DELETE TO authenticated
        USING (agent_id = auth.uid());
END $$;


-- 2. LEAD NOTE ATTACHMENTS TABLE
-- =====================================================================================
CREATE TABLE IF NOT EXISTS public.lead_note_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    note_id UUID NOT NULL REFERENCES public.lead_notes(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    storage_path TEXT NOT NULL UNIQUE,
    mime_type TEXT NULL,
    size_bytes BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT lead_note_attachments_size_check CHECK (size_bytes > 0)
);

ALTER TABLE public.lead_note_attachments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS lead_note_attachments_lead_id_idx ON public.lead_note_attachments(lead_id);
CREATE INDEX IF NOT EXISTS lead_note_attachments_note_id_idx ON public.lead_note_attachments(note_id);
CREATE INDEX IF NOT EXISTS lead_note_attachments_agent_id_idx ON public.lead_note_attachments(agent_id);
CREATE INDEX IF NOT EXISTS lead_note_attachments_created_at_idx ON public.lead_note_attachments(created_at);

-- Note Attachment Match & Agent Ownership Validation Trigger
CREATE OR REPLACE FUNCTION public.check_lead_note_attachment_match()
RETURNS TRIGGER AS $$
DECLARE
    v_note_lead_id UUID;
    v_note_agent_id UUID;
BEGIN
    SELECT lead_id, agent_id INTO v_note_lead_id, v_note_agent_id
    FROM public.lead_notes
    WHERE id = NEW.note_id;

    IF v_note_lead_id IS NULL OR v_note_lead_id <> NEW.lead_id THEN
        RAISE EXCEPTION 'Attachment note_id does not belong to the specified lead_id.';
    END IF;

    IF v_note_agent_id <> NEW.agent_id THEN
        RAISE EXCEPTION 'Attachment agent_id does not match the note owner.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_lead_note_attachment_match_trg ON public.lead_note_attachments;
CREATE TRIGGER check_lead_note_attachment_match_trg
    BEFORE INSERT OR UPDATE ON public.lead_note_attachments
    FOR EACH ROW
    EXECUTE FUNCTION public.check_lead_note_attachment_match();

-- Lead Note Attachments RLS Policies (Idempotent)
DO $$
BEGIN
    DROP POLICY IF EXISTS "Agents can select attachments of their leads" ON public.lead_note_attachments;
    CREATE POLICY "Agents can select attachments of their leads" ON public.lead_note_attachments
        FOR SELECT TO authenticated
        USING (agent_id = auth.uid());

    DROP POLICY IF EXISTS "Agents can insert attachments for their leads" ON public.lead_note_attachments;
    CREATE POLICY "Agents can insert attachments for their leads" ON public.lead_note_attachments
        FOR INSERT TO authenticated
        WITH CHECK (
            agent_id = auth.uid() AND
            EXISTS (SELECT 1 FROM public.leads WHERE id = lead_note_attachments.lead_id AND agent_id = auth.uid())
        );

    DROP POLICY IF EXISTS "Agents can delete attachments of their leads" ON public.lead_note_attachments;
    CREATE POLICY "Agents can delete attachments of their leads" ON public.lead_note_attachments
        FOR DELETE TO authenticated
        USING (agent_id = auth.uid());
END $$;


-- 3. LEAD DOCUMENTS TABLE
-- =====================================================================================
CREATE TABLE IF NOT EXISTS public.lead_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    document_type TEXT NULL,
    description TEXT NULL,
    original_filename TEXT NOT NULL,
    storage_path TEXT NOT NULL UNIQUE,
    mime_type TEXT NULL,
    size_bytes BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT lead_documents_display_name_check CHECK (length(trim(display_name)) > 0),
    CONSTRAINT lead_documents_size_check CHECK (size_bytes > 0)
);

ALTER TABLE public.lead_documents ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS lead_documents_lead_id_idx ON public.lead_documents(lead_id);
CREATE INDEX IF NOT EXISTS lead_documents_agent_id_idx ON public.lead_documents(agent_id);
CREATE INDEX IF NOT EXISTS lead_documents_document_type_idx ON public.lead_documents(document_type);
CREATE INDEX IF NOT EXISTS lead_documents_created_at_idx ON public.lead_documents(created_at);

-- Lead Documents RLS Policies (Idempotent)
DO $$
BEGIN
    DROP POLICY IF EXISTS "Agents can select documents of their leads" ON public.lead_documents;
    CREATE POLICY "Agents can select documents of their leads" ON public.lead_documents
        FOR SELECT TO authenticated
        USING (agent_id = auth.uid());

    DROP POLICY IF EXISTS "Agents can insert documents for their leads" ON public.lead_documents;
    CREATE POLICY "Agents can insert documents for their leads" ON public.lead_documents
        FOR INSERT TO authenticated
        WITH CHECK (
            agent_id = auth.uid() AND
            EXISTS (SELECT 1 FROM public.leads WHERE id = lead_documents.lead_id AND agent_id = auth.uid())
        );

    DROP POLICY IF EXISTS "Agents can update documents of their leads" ON public.lead_documents;
    CREATE POLICY "Agents can update documents of their leads" ON public.lead_documents
        FOR UPDATE TO authenticated
        USING (agent_id = auth.uid())
        WITH CHECK (
            agent_id = auth.uid() AND
            EXISTS (SELECT 1 FROM public.leads WHERE id = lead_documents.lead_id AND agent_id = auth.uid())
        );

    DROP POLICY IF EXISTS "Agents can delete documents of their leads" ON public.lead_documents;
    CREATE POLICY "Agents can delete documents of their leads" ON public.lead_documents
        FOR DELETE TO authenticated
        USING (agent_id = auth.uid());
END $$;


-- 4. LEAD TIMELINE EVENTS TABLE & HARDENED RPC
-- =====================================================================================
CREATE TABLE IF NOT EXISTS public.lead_timeline_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT lead_timeline_title_check CHECK (length(trim(title)) > 0),
    CONSTRAINT lead_timeline_event_type_check CHECK (
        event_type IN (
            'lead_created', 'lead_updated', 'status_changed', 'priority_changed',
            'follow_up_changed', 'note_added', 'note_updated', 'note_deleted',
            'note_attachment_added', 'note_attachment_deleted', 'document_uploaded',
            'document_updated', 'document_deleted', 'lead_converted'
        )
    )
);

ALTER TABLE public.lead_timeline_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS lead_timeline_events_lead_id_idx ON public.lead_timeline_events(lead_id);
CREATE INDEX IF NOT EXISTS lead_timeline_events_agent_id_idx ON public.lead_timeline_events(agent_id);
CREATE INDEX IF NOT EXISTS lead_timeline_events_event_type_idx ON public.lead_timeline_events(event_type);
CREATE INDEX IF NOT EXISTS lead_timeline_events_created_at_idx ON public.lead_timeline_events(created_at);

-- Timeline SELECT Policy
DO $$
BEGIN
    DROP POLICY IF EXISTS "Agents can select timeline events of their leads" ON public.lead_timeline_events;
    CREATE POLICY "Agents can select timeline events of their leads" ON public.lead_timeline_events
        FOR SELECT TO authenticated
        USING (agent_id = auth.uid());
END $$;

-- Hardened Server-Verified Timeline Logging RPC Function
CREATE OR REPLACE FUNCTION public.log_lead_timeline_event(
    p_lead_id UUID,
    p_event_type TEXT,
    p_description TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_agent_id UUID;
    v_event_id UUID;
    v_derived_title TEXT;
BEGIN
    v_agent_id := auth.uid();
    IF v_agent_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated.';
    END IF;

    -- Verify lead belongs to authenticated agent
    IF NOT EXISTS (SELECT 1 FROM public.leads WHERE id = p_lead_id AND agent_id = v_agent_id) THEN
        RAISE EXCEPTION 'Lead not found or access denied.';
    END IF;

    -- Derive approved title server-side based strictly on event_type
    CASE p_event_type
        WHEN 'lead_created' THEN v_derived_title := 'Lead Created';
        WHEN 'lead_updated' THEN v_derived_title := 'Lead Updated';
        WHEN 'status_changed' THEN v_derived_title := 'Status Changed';
        WHEN 'priority_changed' THEN v_derived_title := 'Priority Changed';
        WHEN 'follow_up_changed' THEN v_derived_title := 'Follow-up Changed';
        WHEN 'note_added' THEN v_derived_title := 'Note Added';
        WHEN 'note_updated' THEN v_derived_title := 'Note Updated';
        WHEN 'note_deleted' THEN v_derived_title := 'Note Deleted';
        WHEN 'note_attachment_added' THEN v_derived_title := 'Attachment Uploaded';
        WHEN 'note_attachment_deleted' THEN v_derived_title := 'Attachment Removed';
        WHEN 'document_uploaded' THEN v_derived_title := 'Document Uploaded';
        WHEN 'document_updated' THEN v_derived_title := 'Document Updated';
        WHEN 'document_deleted' THEN v_derived_title := 'Document Deleted';
        WHEN 'lead_converted' THEN v_derived_title := 'Lead Converted to Client';
        ELSE RAISE EXCEPTION 'Invalid event_type: %', p_event_type;
    END CASE;

    INSERT INTO public.lead_timeline_events (
        lead_id,
        agent_id,
        event_type,
        title,
        description,
        metadata
    ) VALUES (
        p_lead_id,
        v_agent_id,
        p_event_type,
        v_derived_title,
        p_description,
        COALESCE(p_metadata, '{}'::jsonb)
    )
    RETURNING id INTO v_event_id;

    -- Update last_activity_at on lead
    UPDATE public.leads
    SET last_activity_at = now(), updated_at = now()
    WHERE id = p_lead_id AND agent_id = v_agent_id;

    RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_lead_timeline_event(UUID, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_lead_timeline_event(UUID, TEXT, TEXT, JSONB) TO authenticated;


-- 5. UPDATED_AT TRIGGERS
-- =====================================================================================
DROP TRIGGER IF EXISTS lead_notes_updated_at_trg ON public.lead_notes;
CREATE TRIGGER lead_notes_updated_at_trg
    BEFORE UPDATE ON public.lead_notes
    FOR EACH ROW
    EXECUTE FUNCTION public.leads_set_updated_at();

DROP TRIGGER IF EXISTS lead_documents_updated_at_trg ON public.lead_documents;
CREATE TRIGGER lead_documents_updated_at_trg
    BEFORE UPDATE ON public.lead_documents
    FOR EACH ROW
    EXECUTE FUNCTION public.leads_set_updated_at();


-- 6. SAFE ONE-TIME BACKFILL FOR EXISTING LEADS
-- =====================================================================================
INSERT INTO public.lead_timeline_events (lead_id, agent_id, event_type, title, description, created_at)
SELECT id, agent_id, 'lead_created', 'Lead Created', 'Lead record created.', created_at
FROM public.leads l
WHERE NOT EXISTS (
    SELECT 1 FROM public.lead_timeline_events e
    WHERE e.lead_id = l.id AND e.event_type = 'lead_created'
);


-- 7. STORAGE BUCKET & IDEMPOTENT STORAGE RLS POLICIES
-- =====================================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('lead-files', 'lead-files', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    DROP POLICY IF EXISTS "lead_files_storage_select" ON storage.objects;
    CREATE POLICY "lead_files_storage_select" ON storage.objects
        FOR SELECT TO authenticated
        USING (
            bucket_id = 'lead-files' AND
            auth.uid()::text = split_part(name, '/', 1)
        );

    DROP POLICY IF EXISTS "lead_files_storage_insert" ON storage.objects;
    CREATE POLICY "lead_files_storage_insert" ON storage.objects
        FOR INSERT TO authenticated
        WITH CHECK (
            bucket_id = 'lead-files' AND
            auth.uid()::text = split_part(name, '/', 1)
        );

    DROP POLICY IF EXISTS "lead_files_storage_update" ON storage.objects;
    CREATE POLICY "lead_files_storage_update" ON storage.objects
        FOR UPDATE TO authenticated
        USING (
            bucket_id = 'lead-files' AND
            auth.uid()::text = split_part(name, '/', 1)
        )
        WITH CHECK (
            bucket_id = 'lead-files' AND
            auth.uid()::text = split_part(name, '/', 1)
        );

    DROP POLICY IF EXISTS "lead_files_storage_delete" ON storage.objects;
    CREATE POLICY "lead_files_storage_delete" ON storage.objects
        FOR DELETE TO authenticated
        USING (
            bucket_id = 'lead-files' AND
            auth.uid()::text = split_part(name, '/', 1)
        );
END $$;
