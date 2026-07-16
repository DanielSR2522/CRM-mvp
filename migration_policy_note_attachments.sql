-- =============================================
-- Policy Note Attachments Migration (Non-Destructive)
-- =============================================

-- 1. POLICY NOTE ATTACHMENTS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS public.policy_note_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id UUID NOT NULL REFERENCES public.policy_notes(id) ON DELETE CASCADE,
    policy_id UUID NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL REFERENCES auth.users(id),
    display_name TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    storage_path TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.policy_note_attachments ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS policy_note_attachments_note_id_idx ON public.policy_note_attachments(note_id);
CREATE INDEX IF NOT EXISTS policy_note_attachments_policy_id_idx ON public.policy_note_attachments(policy_id);
CREATE INDEX IF NOT EXISTS policy_note_attachments_created_at_idx ON public.policy_note_attachments(created_at);

-- Validation trigger: note_id must belong to the same policy_id
CREATE OR REPLACE FUNCTION public.check_note_attachment_policy_match()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.policy_notes
        WHERE id = NEW.note_id AND policy_id = NEW.policy_id
    ) THEN
        RAISE EXCEPTION 'Attachment note_id does not belong to the specified policy_id';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_note_attachment_policy_match_trg ON public.policy_note_attachments;
CREATE TRIGGER check_note_attachment_policy_match_trg
BEFORE INSERT ON public.policy_note_attachments
FOR EACH ROW
EXECUTE FUNCTION public.check_note_attachment_policy_match();

-- 2. RLS POLICIES
-- =============================================

DO $$
BEGIN
    -- SELECT: agents who own the related client
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'policy_note_attachments' AND policyname = 'Agents can select note attachments of their policies'
    ) THEN
        CREATE POLICY "Agents can select note attachments of their policies" ON public.policy_note_attachments
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM public.policies p
                JOIN public.clients c ON p.client_id = c.id
                WHERE p.id = policy_note_attachments.policy_id AND c.agent_id = auth.uid()
            )
        );
    END IF;

    -- INSERT: uploaded_by must be auth.uid(), plus ownership check
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'policy_note_attachments' AND policyname = 'Agents can insert note attachments for their policies'
    ) THEN
        CREATE POLICY "Agents can insert note attachments for their policies" ON public.policy_note_attachments
        FOR INSERT WITH CHECK (
            uploaded_by = auth.uid() AND
            EXISTS (
                SELECT 1 FROM public.policies p
                JOIN public.clients c ON p.client_id = c.id
                WHERE p.id = policy_note_attachments.policy_id AND c.agent_id = auth.uid()
            )
        );
    END IF;

    -- DELETE: agents who own the related client
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'policy_note_attachments' AND policyname = 'Agents can delete note attachments of their policies'
    ) THEN
        CREATE POLICY "Agents can delete note attachments of their policies" ON public.policy_note_attachments
        FOR DELETE USING (
            EXISTS (
                SELECT 1 FROM public.policies p
                JOIN public.clients c ON p.client_id = c.id
                WHERE p.id = policy_note_attachments.policy_id AND c.agent_id = auth.uid()
            )
        );
    END IF;
END $$;
