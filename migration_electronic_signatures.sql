-- =====================================================================================
-- SmarTrack CRM — Electronic Signatures Module ("Consents & Signatures")
-- File:    migration_electronic_signatures.sql
-- Phase:   2 (schema only — no UI, no API routes, no dependencies)
-- Branch:  feature/electronic-signatures
--
-- WHAT THIS MIGRATION DOES
--   Creates 7 new tables, their indexes, CHECK constraints, coherence triggers,
--   row level security policies (one per operation), and 2 private Storage buckets
--   with their own policies.
--
-- WHAT THIS MIGRATION DOES *NOT* DO
--   It does not touch any existing object. clients, policies, profiles,
--   activity_events, policy_documents, policy_document_sections, policy_notes and
--   policy_note_attachments are read-only from this migration's point of view. No
--   existing column, constraint, policy, trigger or bucket is altered, renamed or
--   dropped.
--
-- HOW TO RUN
--   Review first (see docs/electronic-signatures/rollback-guide.md). Then paste into
--   the Supabase SQL Editor and run it as a single script. It follows the project
--   convention of hand-executed .sql files in the repository root (there is no
--   supabase/ directory and no Supabase CLI in this project).
--
-- IDEMPOTENCY
--   Safe to re-run. Tables/indexes use IF NOT EXISTS, policies are guarded by
--   pg_policies lookups, triggers are dropped and recreated, functions use
--   CREATE OR REPLACE, buckets use ON CONFLICT DO UPDATE.
--   Section 0 aborts loudly if a pre-existing object has an incompatible shape,
--   so IF NOT EXISTS never silently hides a schema conflict.
--
-- OWNERSHIP MODEL (the single rule this whole file is built on)
--   Access is always derived from the client, never from created_by alone:
--
--     signature_requests -> client_id -> clients.id -> clients.agent_id -> auth.uid()
--
--   Child tables walk one extra hop:
--
--     <child> -> request_id -> signature_requests.client_id -> clients.agent_id -> auth.uid()
--
--   consent_templates are the one exception: there is no agencies table in this
--   project, so templates are owned directly by the agent (agent_id = auth.uid()).
--   created_by exists for audit only and never grants access.
--
-- SERVICE ROLE NOTE
--   The public signing page (/sign/[token], future phase) cannot use these policies:
--   the signer has no session. It will run server-side with SUPABASE_SERVICE_ROLE_KEY,
--   which bypasses RLS by design. That key must be added by the owner to .env.local
--   in a later phase (never NEXT_PUBLIC_, never imported from a Client Component,
--   never logged, never committed). Bypassing RLS does NOT remove the obligation to
--   validate token, expiry, revocation, status and ownership in server code before
--   any write.
-- =====================================================================================


-- =====================================================================================
-- SECTION 0 — PREFLIGHT GUARDS
-- Fail loudly instead of half-applying. Verifies the objects this module depends on,
-- and refuses to run if one of our 7 tables already exists with a different shape.
-- =====================================================================================

DO $$
BEGIN
    -- ---- Dependencies that must already exist -------------------------------------
    IF to_regclass('public.clients') IS NULL THEN
        RAISE EXCEPTION 'Aborting: public.clients not found. Run migration.sql first.';
    END IF;

    IF to_regclass('public.policies') IS NULL THEN
        RAISE EXCEPTION 'Aborting: public.policies not found. Run migration.sql first.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'agent_id'
    ) THEN
        RAISE EXCEPTION 'Aborting: public.clients.agent_id not found. The whole RLS model of this module depends on it.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'policies' AND column_name = 'client_id'
    ) THEN
        RAISE EXCEPTION 'Aborting: public.policies.client_id not found.';
    END IF;

    IF to_regclass('storage.buckets') IS NULL THEN
        RAISE EXCEPTION 'Aborting: storage schema not available. This module needs Supabase Storage.';
    END IF;

    -- ---- Conflict guards: existing tables must match what we expect ---------------
    -- Each check picks a column that only *our* version of the table would have.
    IF to_regclass('public.consent_templates') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'consent_templates' AND column_name = 'current_version'
    ) THEN
        RAISE EXCEPTION 'Aborting: public.consent_templates already exists with an incompatible shape (no current_version column). Inspect it manually; this migration will not adopt an unknown table.';
    END IF;

    IF to_regclass('public.consent_template_versions') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'consent_template_versions' AND column_name = 'version_number'
    ) THEN
        RAISE EXCEPTION 'Aborting: public.consent_template_versions already exists with an incompatible shape.';
    END IF;

    IF to_regclass('public.signature_requests') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'signature_requests' AND column_name = 'template_version_id'
    ) THEN
        RAISE EXCEPTION 'Aborting: public.signature_requests already exists with an incompatible shape.';
    END IF;

    IF to_regclass('public.signature_request_signers') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'signature_request_signers' AND column_name = 'token_hash'
    ) THEN
        RAISE EXCEPTION 'Aborting: public.signature_request_signers already exists with an incompatible shape.';
    END IF;

    IF to_regclass('public.signature_events') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'signature_events' AND column_name = 'event_type'
    ) THEN
        RAISE EXCEPTION 'Aborting: public.signature_events already exists with an incompatible shape.';
    END IF;

    IF to_regclass('public.signature_delivery_attempts') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'signature_delivery_attempts' AND column_name = 'attempted_at'
    ) THEN
        RAISE EXCEPTION 'Aborting: public.signature_delivery_attempts already exists with an incompatible shape.';
    END IF;

    IF to_regclass('public.signature_files') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'signature_files' AND column_name = 'sha256_hash'
    ) THEN
        RAISE EXCEPTION 'Aborting: public.signature_files already exists with an incompatible shape.';
    END IF;
END $$;


-- =====================================================================================
-- SECTION 1 — SHARED HELPER FUNCTION
-- Every function in this module is namespaced (consents_ / signature_) so that rollback
-- can drop them without any chance of touching an unrelated object.
-- None of them is SECURITY DEFINER: they run as the caller, so RLS still applies to the
-- rows they read. That is exactly what we want — an agent probing another agent's
-- policy_id simply sees no row and the validation raises.
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.consents_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.consents_set_updated_at() IS
    'Keeps updated_at authoritative at the database level for the Consents & Signatures module.';


-- =====================================================================================
-- SECTION 2 — consent_templates
-- Reusable consent/disclosure documents authored inside the CRM.
-- Owned by the agent (there is no agencies table in this project).
-- A template that has versions can never be hard-deleted — it is archived instead.
-- =====================================================================================

CREATE TABLE IF NOT EXISTS public.consent_templates (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_by       UUID NOT NULL REFERENCES auth.users(id),
    internal_name    TEXT NOT NULL,
    public_title     TEXT NOT NULL,
    description      TEXT,
    language         TEXT NOT NULL DEFAULT 'en',
    current_version  INTEGER NOT NULL DEFAULT 1,
    status           TEXT NOT NULL DEFAULT 'draft',
    usage_count      INTEGER NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at      TIMESTAMPTZ,

    CONSTRAINT consent_templates_status_check
        CHECK (status IN ('draft', 'active', 'inactive', 'archived')),
    CONSTRAINT consent_templates_language_check
        CHECK (language IN ('en', 'es')),
    CONSTRAINT consent_templates_internal_name_check
        CHECK (btrim(internal_name) <> ''),
    CONSTRAINT consent_templates_public_title_check
        CHECK (btrim(public_title) <> ''),
    CONSTRAINT consent_templates_current_version_check
        CHECK (current_version >= 1),
    CONSTRAINT consent_templates_usage_count_check
        CHECK (usage_count >= 0),
    -- An archived template must carry the moment it was archived.
    CONSTRAINT consent_templates_archived_at_check
        CHECK (status <> 'archived' OR archived_at IS NOT NULL)
);

ALTER TABLE public.consent_templates ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS consent_templates_agent_id_idx
    ON public.consent_templates(agent_id);
CREATE INDEX IF NOT EXISTS consent_templates_agent_status_idx
    ON public.consent_templates(agent_id, status);
CREATE INDEX IF NOT EXISTS consent_templates_created_at_idx
    ON public.consent_templates(created_at);

DROP TRIGGER IF EXISTS consent_templates_set_updated_at_trg ON public.consent_templates;
CREATE TRIGGER consent_templates_set_updated_at_trg
    BEFORE UPDATE ON public.consent_templates
    FOR EACH ROW
    EXECUTE FUNCTION public.consents_set_updated_at();

COMMENT ON TABLE public.consent_templates IS
    'Consent/disclosure templates authored in the CRM. Owned by the agent (no agencies table exists). Never hard-deleted once versioned — archived instead.';
COMMENT ON COLUMN public.consent_templates.agent_id IS
    'Owner. This column alone decides read/write access (RLS). Must equal auth.uid() on insert.';
COMMENT ON COLUMN public.consent_templates.created_by IS
    'Audit only. Never grants access on its own.';
COMMENT ON COLUMN public.consent_templates.current_version IS
    'Points at the highest version_number in consent_template_versions. Maintained by the service layer.';
COMMENT ON COLUMN public.consent_templates.usage_count IS
    'Number of signature_requests created from this template. Maintained by the service layer; used by the UI and by the DELETE policy.';

-- ---- RLS: one policy per operation, no FOR ALL, no USING (true) ---------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'consent_templates' AND policyname = 'Agents can select their own consent templates') THEN
        CREATE POLICY "Agents can select their own consent templates"
        ON public.consent_templates
        FOR SELECT TO authenticated
        USING (agent_id = auth.uid());
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'consent_templates' AND policyname = 'Agents can insert their own consent templates') THEN
        CREATE POLICY "Agents can insert their own consent templates"
        ON public.consent_templates
        FOR INSERT TO authenticated
        WITH CHECK (agent_id = auth.uid() AND created_by = auth.uid());
    END IF;

    -- WITH CHECK repeats the rule so a template cannot be re-assigned to another agent.
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'consent_templates' AND policyname = 'Agents can update their own consent templates') THEN
        CREATE POLICY "Agents can update their own consent templates"
        ON public.consent_templates
        FOR UPDATE TO authenticated
        USING (agent_id = auth.uid())
        WITH CHECK (agent_id = auth.uid());
    END IF;

    -- Only an unused draft can be hard-deleted. Anything with versions is additionally
    -- blocked at FK level (consent_template_versions.template_id ON DELETE RESTRICT).
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'consent_templates' AND policyname = 'Agents can delete their own unused draft templates') THEN
        CREATE POLICY "Agents can delete their own unused draft templates"
        ON public.consent_templates
        FOR DELETE TO authenticated
        USING (agent_id = auth.uid() AND status = 'draft' AND usage_count = 0);
    END IF;
END $$;


-- =====================================================================================
-- SECTION 3 — consent_template_versions
-- Immutable snapshots of a template's body. A signature_request always points at one
-- exact version, so editing a template later can never alter a document already sent.
--
-- DECISION: content is JSONB (structured blocks), not HTML.
--   Rationale: arbitrary HTML as the canonical source means every read path has to be
--   trusted to sanitize. Structured JSON is rendered to HTML at display time, so the
--   stored value can never carry a script, an iframe or an event handler in the first
--   place. Matches the owner's stated preference for Phase 2.
--   Expected shape: {"blocks": [{"type": "...", ...}, ...]}
-- =====================================================================================

CREATE TABLE IF NOT EXISTS public.consent_template_versions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- RESTRICT: a template that has versions can never be dropped by deleting its parent.
    template_id     UUID NOT NULL REFERENCES public.consent_templates(id) ON DELETE RESTRICT,
    version_number  INTEGER NOT NULL,
    content         JSONB NOT NULL,
    consent_text    TEXT NOT NULL,
    variables_used  JSONB NOT NULL DEFAULT '[]'::jsonb,
    content_hash    TEXT,
    created_by      UUID NOT NULL REFERENCES auth.users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT consent_template_versions_unique_version
        UNIQUE (template_id, version_number),
    CONSTRAINT consent_template_versions_version_number_check
        CHECK (version_number >= 1),
    CONSTRAINT consent_template_versions_content_check
        CHECK (jsonb_typeof(content) = 'object'),
    CONSTRAINT consent_template_versions_variables_used_check
        CHECK (jsonb_typeof(variables_used) = 'array'),
    CONSTRAINT consent_template_versions_consent_text_check
        CHECK (btrim(consent_text) <> ''),
    -- Hashes in this module are always lowercase hex SHA-256.
    CONSTRAINT consent_template_versions_content_hash_check
        CHECK (content_hash IS NULL OR content_hash ~ '^[a-f0-9]{64}$')
);

ALTER TABLE public.consent_template_versions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS consent_template_versions_template_id_idx
    ON public.consent_template_versions(template_id);
CREATE INDEX IF NOT EXISTS consent_template_versions_created_at_idx
    ON public.consent_template_versions(created_at);

COMMENT ON TABLE public.consent_template_versions IS
    'Frozen snapshots of template bodies. Once a version is referenced by a signature_request it can no longer be updated (trigger) or deleted (FK RESTRICT).';
COMMENT ON COLUMN public.consent_template_versions.content IS
    'Structured JSON blocks — {"blocks":[...]}. Canonical source. Never store raw HTML here; HTML is produced at render time.';
COMMENT ON COLUMN public.consent_template_versions.consent_text IS
    'The e-signature consent statement the signer must accept. Snapshotted onto the signer row at signing time.';
COMMENT ON COLUMN public.consent_template_versions.variables_used IS
    'JSON array of the {{variable}} keys referenced by content, for merge validation.';

-- ---- Freeze used versions ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consent_template_versions_guard_frozen()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.signature_requests sr
        WHERE sr.template_version_id = OLD.id
    ) THEN
        RAISE EXCEPTION
            'Template version % is already used by one or more signature requests and is frozen. Publish a new version instead.',
            OLD.id;
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.consent_template_versions_guard_frozen() IS
    'Blocks UPDATE of any template version already referenced by a signature request. DELETE is separately blocked by the FK RESTRICT on signature_requests.template_version_id.';

DROP TRIGGER IF EXISTS consent_template_versions_guard_frozen_trg ON public.consent_template_versions;
CREATE TRIGGER consent_template_versions_guard_frozen_trg
    BEFORE UPDATE ON public.consent_template_versions
    FOR EACH ROW
    EXECUTE FUNCTION public.consent_template_versions_guard_frozen();

-- ---- RLS: ownership walks up to the template's agent --------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'consent_template_versions' AND policyname = 'Agents can select versions of their templates') THEN
        CREATE POLICY "Agents can select versions of their templates"
        ON public.consent_template_versions
        FOR SELECT TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.consent_templates t
                WHERE t.id = consent_template_versions.template_id
                  AND t.agent_id = auth.uid()
            )
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'consent_template_versions' AND policyname = 'Agents can insert versions for their templates') THEN
        CREATE POLICY "Agents can insert versions for their templates"
        ON public.consent_template_versions
        FOR INSERT TO authenticated
        WITH CHECK (
            created_by = auth.uid()
            AND EXISTS (
                SELECT 1 FROM public.consent_templates t
                WHERE t.id = consent_template_versions.template_id
                  AND t.agent_id = auth.uid()
            )
        );
    END IF;

    -- Allowed only for versions nobody has used yet; the trigger above enforces that.
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'consent_template_versions' AND policyname = 'Agents can update unused versions of their templates') THEN
        CREATE POLICY "Agents can update unused versions of their templates"
        ON public.consent_template_versions
        FOR UPDATE TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.consent_templates t
                WHERE t.id = consent_template_versions.template_id
                  AND t.agent_id = auth.uid()
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.consent_templates t
                WHERE t.id = consent_template_versions.template_id
                  AND t.agent_id = auth.uid()
            )
        );
    END IF;

    -- Used versions are additionally blocked by FK RESTRICT from signature_requests.
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'consent_template_versions' AND policyname = 'Agents can delete unused versions of their templates') THEN
        CREATE POLICY "Agents can delete unused versions of their templates"
        ON public.consent_template_versions
        FOR DELETE TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.consent_templates t
                WHERE t.id = consent_template_versions.template_id
                  AND t.agent_id = auth.uid()
            )
        );
    END IF;
END $$;


-- =====================================================================================
-- SECTION 4 — signature_requests
-- One consent sent to one client. Carries the frozen document: rendered_content plus
-- the merge_data_snapshot it was built from, plus the SHA-256 of what the signer saw.
--
-- FK DECISIONS (deliberate, see report):
--   client_id  ON DELETE RESTRICT — deviates from activity_events (which CASCADEs).
--                Signed consents are evidence; deleting a client must not silently
--                erase them. Consequence: a client with consents cannot be deleted
--                until they are handled. Documented as a known operational trade-off.
--   policy_id  ON DELETE SET NULL — matches the existing activity_events convention
--                ("SET NULL constraint to retain event history"). Deleting a policy
--                keeps the consent and its evidence; the request simply stops being
--                linked to that policy.
--   template_id / template_version_id ON DELETE RESTRICT — the document's provenance
--                must remain resolvable forever.
-- =====================================================================================

CREATE TABLE IF NOT EXISTS public.signature_requests (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id                 UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
    policy_id                 UUID REFERENCES public.policies(id) ON DELETE SET NULL,
    template_id               UUID NOT NULL REFERENCES public.consent_templates(id) ON DELETE RESTRICT,
    template_version_id       UUID NOT NULL REFERENCES public.consent_template_versions(id) ON DELETE RESTRICT,
    created_by                UUID NOT NULL REFERENCES auth.users(id),
    title                     TEXT NOT NULL,
    rendered_content          JSONB NOT NULL,
    merge_data_snapshot       JSONB NOT NULL DEFAULT '{}'::jsonb,
    status                    TEXT NOT NULL DEFAULT 'draft',
    selected_delivery_channel TEXT,
    original_document_hash    TEXT,
    final_document_hash       TEXT,
    sent_at                   TIMESTAMPTZ,
    viewed_at                 TIMESTAMPTZ,
    signed_at                 TIMESTAMPTZ,
    declined_at               TIMESTAMPTZ,
    cancelled_at              TIMESTAMPTZ,
    expires_at                TIMESTAMPTZ,
    final_file_path           TEXT,
    final_document_status     TEXT NOT NULL DEFAULT 'not_started',
    final_document_error      TEXT,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT signature_requests_status_check
        CHECK (status IN ('draft', 'pending', 'sent', 'viewed', 'signed', 'declined', 'expired', 'cancelled', 'failed')),
    CONSTRAINT signature_requests_channel_check
        CHECK (selected_delivery_channel IS NULL OR selected_delivery_channel IN ('email', 'whatsapp', 'sms', 'copy_link')),
    CONSTRAINT signature_requests_final_document_status_check
        CHECK (final_document_status IN ('not_started', 'pending', 'generating', 'generated', 'failed')),
    CONSTRAINT signature_requests_title_check
        CHECK (btrim(title) <> ''),
    CONSTRAINT signature_requests_rendered_content_check
        CHECK (jsonb_typeof(rendered_content) = 'object'),
    CONSTRAINT signature_requests_merge_snapshot_check
        CHECK (jsonb_typeof(merge_data_snapshot) = 'object'),
    CONSTRAINT signature_requests_original_hash_check
        CHECK (original_document_hash IS NULL OR original_document_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT signature_requests_final_hash_check
        CHECK (final_document_hash IS NULL OR final_document_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT signature_requests_expires_at_check
        CHECK (expires_at IS NULL OR expires_at > created_at),
    -- A status implies its timestamp. Keeps the audit trail honest.
    CONSTRAINT signature_requests_sent_at_check
        CHECK (status <> 'sent' OR sent_at IS NOT NULL),
    CONSTRAINT signature_requests_signed_at_check
        CHECK (status <> 'signed' OR signed_at IS NOT NULL),
    CONSTRAINT signature_requests_declined_at_check
        CHECK (status <> 'declined' OR declined_at IS NOT NULL),
    CONSTRAINT signature_requests_cancelled_at_check
        CHECK (status <> 'cancelled' OR cancelled_at IS NOT NULL)
);

ALTER TABLE public.signature_requests ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS signature_requests_client_id_idx
    ON public.signature_requests(client_id);
CREATE INDEX IF NOT EXISTS signature_requests_policy_id_idx
    ON public.signature_requests(policy_id);
CREATE INDEX IF NOT EXISTS signature_requests_template_id_idx
    ON public.signature_requests(template_id);
CREATE INDEX IF NOT EXISTS signature_requests_template_version_id_idx
    ON public.signature_requests(template_version_id);
CREATE INDEX IF NOT EXISTS signature_requests_created_by_idx
    ON public.signature_requests(created_by);
CREATE INDEX IF NOT EXISTS signature_requests_status_idx
    ON public.signature_requests(status);
CREATE INDEX IF NOT EXISTS signature_requests_client_status_idx
    ON public.signature_requests(client_id, status);
CREATE INDEX IF NOT EXISTS signature_requests_created_at_idx
    ON public.signature_requests(created_at);
-- Partial index: lets "which requests just expired?" be a cheap query instead of a cron job.
CREATE INDEX IF NOT EXISTS signature_requests_expiry_idx
    ON public.signature_requests(expires_at)
    WHERE status IN ('sent', 'viewed');

COMMENT ON TABLE public.signature_requests IS
    'One consent document sent to one client. Holds the frozen document and its hashes. client_id is RESTRICT on purpose: signed consents are evidence.';
COMMENT ON COLUMN public.signature_requests.rendered_content IS
    'The exact document the signer received, structured JSON, frozen once sent_at is set.';
COMMENT ON COLUMN public.signature_requests.merge_data_snapshot IS
    'The client/agent/policy values used to render the document, captured at creation time. Frozen once sent.';
COMMENT ON COLUMN public.signature_requests.original_document_hash IS
    'Lowercase hex SHA-256 of the canonical rendered_content at creation time.';
COMMENT ON COLUMN public.signature_requests.final_document_status IS
    'Lifecycle of the signed PDF generation, tracked separately from status so a generation failure never forces the client to sign again.';

-- ---- Relational coherence -----------------------------------------------------------
-- These queries run as the caller, so RLS applies: referencing another agent's policy
-- or template returns no row and raises, without leaking whether it exists.
CREATE OR REPLACE FUNCTION public.signature_requests_validate_relations()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_client_agent_id UUID;
BEGIN
    -- 1. The policy, when present, must belong to the same client.
    IF NEW.policy_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.policies p
            WHERE p.id = NEW.policy_id AND p.client_id = NEW.client_id
        ) THEN
            RAISE EXCEPTION 'signature_requests.policy_id % does not belong to client_id %', NEW.policy_id, NEW.client_id;
        END IF;
    END IF;

    -- 2. The version must belong to the template.
    IF NOT EXISTS (
        SELECT 1 FROM public.consent_template_versions v
        WHERE v.id = NEW.template_version_id AND v.template_id = NEW.template_id
    ) THEN
        RAISE EXCEPTION 'signature_requests.template_version_id % does not belong to template_id %', NEW.template_version_id, NEW.template_id;
    END IF;

    -- 3. The template must belong to the same agent that owns the client.
    SELECT c.agent_id INTO v_client_agent_id
    FROM public.clients c
    WHERE c.id = NEW.client_id;

    IF v_client_agent_id IS NULL THEN
        RAISE EXCEPTION 'signature_requests.client_id % is not visible or does not exist', NEW.client_id;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.consent_templates t
        WHERE t.id = NEW.template_id AND t.agent_id = v_client_agent_id
    ) THEN
        RAISE EXCEPTION 'signature_requests.template_id % is not owned by the agent that owns client_id %', NEW.template_id, NEW.client_id;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.signature_requests_validate_relations() IS
    'Enforces policy->client, version->template and template->agent coherence. Not SECURITY DEFINER: RLS on the referenced tables is part of the check.';

DROP TRIGGER IF EXISTS signature_requests_validate_relations_trg ON public.signature_requests;
CREATE TRIGGER signature_requests_validate_relations_trg
    BEFORE INSERT OR UPDATE OF client_id, policy_id, template_id, template_version_id
    ON public.signature_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.signature_requests_validate_relations();

-- ---- Immutability and legal state machine -------------------------------------------
CREATE OR REPLACE FUNCTION public.signature_requests_guard_transitions()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Once the document has left the building, its content is evidence.
    IF OLD.sent_at IS NOT NULL THEN
        IF NEW.rendered_content IS DISTINCT FROM OLD.rendered_content THEN
            RAISE EXCEPTION 'rendered_content is frozen once a request has been sent (request %)', OLD.id;
        END IF;
        IF NEW.merge_data_snapshot IS DISTINCT FROM OLD.merge_data_snapshot THEN
            RAISE EXCEPTION 'merge_data_snapshot is frozen once a request has been sent (request %)', OLD.id;
        END IF;
        IF NEW.template_id IS DISTINCT FROM OLD.template_id THEN
            RAISE EXCEPTION 'template_id is frozen once a request has been sent (request %)', OLD.id;
        END IF;
        IF NEW.template_version_id IS DISTINCT FROM OLD.template_version_id THEN
            RAISE EXCEPTION 'template_version_id is frozen once a request has been sent (request %)', OLD.id;
        END IF;
        IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
            RAISE EXCEPTION 'client_id is frozen once a request has been sent (request %)', OLD.id;
        END IF;
        IF NEW.original_document_hash IS DISTINCT FROM OLD.original_document_hash THEN
            RAISE EXCEPTION 'original_document_hash is frozen once a request has been sent (request %)', OLD.id;
        END IF;
    END IF;

    -- Terminal states never reopen.
    IF OLD.status IN ('signed', 'declined', 'cancelled') AND NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'signature request % is in terminal state "%" and cannot transition to "%"', OLD.id, OLD.status, NEW.status;
    END IF;

    -- Signing evidence is written once.
    IF OLD.signed_at IS NOT NULL AND NEW.signed_at IS DISTINCT FROM OLD.signed_at THEN
        RAISE EXCEPTION 'signed_at is immutable once set (request %)', OLD.id;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.signature_requests_guard_transitions() IS
    'Freezes document content after send, makes signed/declined/cancelled terminal, and makes signed_at write-once. Applies to the service role too.';

DROP TRIGGER IF EXISTS signature_requests_guard_transitions_trg ON public.signature_requests;
CREATE TRIGGER signature_requests_guard_transitions_trg
    BEFORE UPDATE ON public.signature_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.signature_requests_guard_transitions();

-- ---- Deletion guard ------------------------------------------------------------------
-- Belt and braces: the RLS DELETE policy already limits deletion to drafts, but the
-- service role bypasses RLS, so the rule is also enforced here.
CREATE OR REPLACE FUNCTION public.signature_requests_guard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status <> 'draft' THEN
        RAISE EXCEPTION 'signature request % has status "%" and cannot be deleted. Cancel it instead.', OLD.id, OLD.status;
    END IF;
    RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.signature_requests_guard_delete() IS
    'Only never-sent drafts may be hard-deleted. Everything else is evidence and must be cancelled, not removed.';

DROP TRIGGER IF EXISTS signature_requests_guard_delete_trg ON public.signature_requests;
CREATE TRIGGER signature_requests_guard_delete_trg
    BEFORE DELETE ON public.signature_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.signature_requests_guard_delete();

DROP TRIGGER IF EXISTS signature_requests_set_updated_at_trg ON public.signature_requests;
CREATE TRIGGER signature_requests_set_updated_at_trg
    BEFORE UPDATE ON public.signature_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.consents_set_updated_at();

-- ---- RLS ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'signature_requests' AND policyname = 'Agents can select requests of their clients') THEN
        CREATE POLICY "Agents can select requests of their clients"
        ON public.signature_requests
        FOR SELECT TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.clients c
                WHERE c.id = signature_requests.client_id
                  AND c.agent_id = auth.uid()
            )
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'signature_requests' AND policyname = 'Agents can insert requests for their clients') THEN
        CREATE POLICY "Agents can insert requests for their clients"
        ON public.signature_requests
        FOR INSERT TO authenticated
        WITH CHECK (
            created_by = auth.uid()
            AND EXISTS (
                SELECT 1 FROM public.clients c
                WHERE c.id = signature_requests.client_id
                  AND c.agent_id = auth.uid()
            )
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'signature_requests' AND policyname = 'Agents can update requests of their clients') THEN
        CREATE POLICY "Agents can update requests of their clients"
        ON public.signature_requests
        FOR UPDATE TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.clients c
                WHERE c.id = signature_requests.client_id
                  AND c.agent_id = auth.uid()
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.clients c
                WHERE c.id = signature_requests.client_id
                  AND c.agent_id = auth.uid()
            )
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'signature_requests' AND policyname = 'Agents can delete draft requests of their clients') THEN
        CREATE POLICY "Agents can delete draft requests of their clients"
        ON public.signature_requests
        FOR DELETE TO authenticated
        USING (
            status = 'draft'
            AND EXISTS (
                SELECT 1 FROM public.clients c
                WHERE c.id = signature_requests.client_id
                  AND c.agent_id = auth.uid()
            )
        );
    END IF;
END $$;


-- =====================================================================================
-- SECTION 5 — signature_request_signers
-- V1 uses exactly one signer per request, but the shape already supports several.
-- Only the SHA-256 of the secure token is ever stored: the raw token exists only in
-- the link handed to the signer.
-- request_id CASCADEs safely because deleting a request is only possible while draft.
-- =====================================================================================

CREATE TABLE IF NOT EXISTS public.signature_request_signers (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id            UUID NOT NULL REFERENCES public.signature_requests(id) ON DELETE CASCADE,
    signer_order          INTEGER NOT NULL DEFAULT 1,
    full_name             TEXT NOT NULL,
    email                 TEXT,
    phone                 TEXT,
    token_hash            TEXT NOT NULL,
    token_expires_at      TIMESTAMPTZ NOT NULL,
    token_revoked_at      TIMESTAMPTZ,
    signature_method      TEXT,
    signature_image_path  TEXT,
    typed_signature       TEXT,
    consent_text_snapshot TEXT,
    consent_version       TEXT,
    consent_accepted_at   TIMESTAMPTZ,
    viewed_at             TIMESTAMPTZ,
    signed_at             TIMESTAMPTZ,
    declined_at           TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT signature_request_signers_unique_order
        UNIQUE (request_id, signer_order),
    CONSTRAINT signature_request_signers_unique_token
        UNIQUE (token_hash),
    CONSTRAINT signature_request_signers_order_check
        CHECK (signer_order >= 1),
    CONSTRAINT signature_request_signers_full_name_check
        CHECK (btrim(full_name) <> ''),
    -- Structurally guarantees a raw token can never be stored here by mistake.
    CONSTRAINT signature_request_signers_token_hash_check
        CHECK (token_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT signature_request_signers_method_check
        CHECK (signature_method IS NULL OR signature_method IN ('draw', 'typed')),
    -- A drawn signature needs its image; a typed signature needs its text.
    CONSTRAINT signature_request_signers_method_payload_check
        CHECK (
            signature_method IS NULL
            OR (signature_method = 'draw'  AND signature_image_path IS NOT NULL)
            OR (signature_method = 'typed' AND btrim(coalesce(typed_signature, '')) <> '')
        ),
    -- Nobody signs without having accepted the e-signature consent first.
    CONSTRAINT signature_request_signers_consent_before_sign_check
        CHECK (signed_at IS NULL OR consent_accepted_at IS NOT NULL),
    CONSTRAINT signature_request_signers_method_on_sign_check
        CHECK (signed_at IS NULL OR signature_method IS NOT NULL),
    -- What was accepted must be recorded alongside when it was accepted.
    CONSTRAINT signature_request_signers_consent_snapshot_check
        CHECK (consent_accepted_at IS NULL OR btrim(coalesce(consent_text_snapshot, '')) <> ''),
    -- A signer cannot both sign and decline.
    CONSTRAINT signature_request_signers_sign_xor_decline_check
        CHECK (signed_at IS NULL OR declined_at IS NULL)
);

ALTER TABLE public.signature_request_signers ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS signature_request_signers_request_id_idx
    ON public.signature_request_signers(request_id);
CREATE INDEX IF NOT EXISTS signature_request_signers_expiry_idx
    ON public.signature_request_signers(token_expires_at)
    WHERE signed_at IS NULL AND declined_at IS NULL AND token_revoked_at IS NULL;

COMMENT ON TABLE public.signature_request_signers IS
    'Signers of a request. V1 creates exactly one (signer_order = 1); the shape supports more without a migration.';
COMMENT ON COLUMN public.signature_request_signers.token_hash IS
    'Lowercase hex SHA-256 of the secure token. The raw token is never stored, never logged, and lives only in the /sign/<token> link.';
COMMENT ON COLUMN public.signature_request_signers.token_revoked_at IS
    'Set when the link stops working: signed, declined, cancelled or manually revoked.';
COMMENT ON COLUMN public.signature_request_signers.consent_text_snapshot IS
    'The exact consent wording the signer accepted, copied here at acceptance time so later template edits cannot rewrite history.';

-- ---- Signing guard: no replay, no double-signature, no signing on a dead token -------
CREATE OR REPLACE FUNCTION public.signature_request_signers_guard_signing()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- A token revoked *before* this statement can never produce a signature.
    -- Note the signing flow legitimately sets signed_at and token_revoked_at in the same
    -- statement, which is why this looks at OLD, not NEW.
    IF OLD.token_revoked_at IS NOT NULL AND OLD.signed_at IS NULL AND NEW.signed_at IS NOT NULL THEN
        RAISE EXCEPTION 'signer % has a revoked token and cannot sign', OLD.id;
    END IF;

    IF OLD.declined_at IS NOT NULL AND NEW.signed_at IS NOT NULL THEN
        RAISE EXCEPTION 'signer % already declined and cannot sign', OLD.id;
    END IF;

    -- Write-once signing evidence.
    IF OLD.signed_at IS NOT NULL THEN
        IF NEW.signed_at IS DISTINCT FROM OLD.signed_at THEN
            RAISE EXCEPTION 'signer % already signed; signed_at is immutable', OLD.id;
        END IF;
        IF NEW.signature_method IS DISTINCT FROM OLD.signature_method
           OR NEW.signature_image_path IS DISTINCT FROM OLD.signature_image_path
           OR NEW.typed_signature IS DISTINCT FROM OLD.typed_signature
           OR NEW.consent_accepted_at IS DISTINCT FROM OLD.consent_accepted_at
           OR NEW.consent_text_snapshot IS DISTINCT FROM OLD.consent_text_snapshot
           OR NEW.full_name IS DISTINCT FROM OLD.full_name THEN
            RAISE EXCEPTION 'signature evidence for signer % is immutable once signed', OLD.id;
        END IF;
    END IF;

    -- The token hash itself is write-once: rotating it would orphan the audit trail.
    IF NEW.token_hash IS DISTINCT FROM OLD.token_hash THEN
        RAISE EXCEPTION 'token_hash cannot be rotated for signer %; create a new request instead', OLD.id;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.signature_request_signers_guard_signing() IS
    'Prevents replay, double-signature, signing on a revoked/declined token, and any edit of signature evidence after the fact. Applies to the service role too.';

DROP TRIGGER IF EXISTS signature_request_signers_guard_signing_trg ON public.signature_request_signers;
CREATE TRIGGER signature_request_signers_guard_signing_trg
    BEFORE UPDATE ON public.signature_request_signers
    FOR EACH ROW
    EXECUTE FUNCTION public.signature_request_signers_guard_signing();

-- ---- RLS ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'signature_request_signers' AND policyname = 'Agents can select signers of their requests') THEN
        CREATE POLICY "Agents can select signers of their requests"
        ON public.signature_request_signers
        FOR SELECT TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.signature_requests sr
                JOIN public.clients c ON c.id = sr.client_id
                WHERE sr.id = signature_request_signers.request_id
                  AND c.agent_id = auth.uid()
            )
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'signature_request_signers' AND policyname = 'Agents can insert signers for their requests') THEN
        CREATE POLICY "Agents can insert signers for their requests"
        ON public.signature_request_signers
        FOR INSERT TO authenticated
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.signature_requests sr
                JOIN public.clients c ON c.id = sr.client_id
                WHERE sr.id = signature_request_signers.request_id
                  AND c.agent_id = auth.uid()
            )
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'signature_request_signers' AND policyname = 'Agents can update signers of their requests') THEN
        CREATE POLICY "Agents can update signers of their requests"
        ON public.signature_request_signers
        FOR UPDATE TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.signature_requests sr
                JOIN public.clients c ON c.id = sr.client_id
                WHERE sr.id = signature_request_signers.request_id
                  AND c.agent_id = auth.uid()
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.signature_requests sr
                JOIN public.clients c ON c.id = sr.client_id
                WHERE sr.id = signature_request_signers.request_id
                  AND c.agent_id = auth.uid()
            )
        );
    END IF;

    -- Signers may only be removed while the request is still a draft.
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'signature_request_signers' AND policyname = 'Agents can delete signers of their draft requests') THEN
        CREATE POLICY "Agents can delete signers of their draft requests"
        ON public.signature_request_signers
        FOR DELETE TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.signature_requests sr
                JOIN public.clients c ON c.id = sr.client_id
                WHERE sr.id = signature_request_signers.request_id
                  AND c.agent_id = auth.uid()
                  AND sr.status = 'draft'
            )
        );
    END IF;
END $$;


-- =====================================================================================
-- SECTION 6 — signature_events
-- Append-only audit trail. No UPDATE policy, no DELETE policy, plus a trigger that
-- blocks UPDATE even for the service role.
-- DELETE is only reachable through the CASCADE from a draft request, which by
-- definition carries no signing evidence.
-- =====================================================================================

CREATE TABLE IF NOT EXISTS public.signature_events (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id   UUID NOT NULL REFERENCES public.signature_requests(id) ON DELETE CASCADE,
    signer_id    UUID REFERENCES public.signature_request_signers(id) ON DELETE SET NULL,
    performed_by UUID REFERENCES auth.users(id),
    event_type   TEXT NOT NULL,
    ip_address   INET,
    user_agent   TEXT,
    channel      TEXT,
    metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT signature_events_event_type_check
        CHECK (event_type IN (
            'request_created',
            'request_updated',
            'request_sent',
            'email_sent',
            'email_failed',
            'whatsapp_link_opened',
            'sms_link_opened',
            'secure_link_copied',
            'document_viewed',
            'consent_accepted',
            'signature_started',
            'document_signed',
            'document_declined',
            'request_expired',
            'request_cancelled',
            'final_document_generated',
            'final_document_failed',
            'document_downloaded',
            'delivery_failed'
        )),
    CONSTRAINT signature_events_channel_check
        CHECK (channel IS NULL OR channel IN ('email', 'whatsapp', 'sms', 'copy_link')),
    CONSTRAINT signature_events_metadata_check
        CHECK (jsonb_typeof(metadata) = 'object')
);

ALTER TABLE public.signature_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS signature_events_request_id_idx
    ON public.signature_events(request_id);
CREATE INDEX IF NOT EXISTS signature_events_signer_id_idx
    ON public.signature_events(signer_id);
CREATE INDEX IF NOT EXISTS signature_events_event_type_idx
    ON public.signature_events(event_type);
CREATE INDEX IF NOT EXISTS signature_events_created_at_idx
    ON public.signature_events(created_at);

COMMENT ON TABLE public.signature_events IS
    'Append-only audit trail for the Consents & Signatures module. UPDATE is blocked by trigger; no DELETE policy exists.';
COMMENT ON COLUMN public.signature_events.performed_by IS
    'The agent who performed the action, or NULL for actions performed by the public signer (inserted server-side with the service role).';
COMMENT ON COLUMN public.signature_events.ip_address IS
    'Captured server-side for signing events. Never trust a client-supplied value here.';
COMMENT ON COLUMN public.signature_events.metadata IS
    'Free-form context. Must never contain raw tokens, full secrets, or the service role key.';

CREATE OR REPLACE FUNCTION public.signature_events_block_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'signature_events is append-only; event % cannot be modified', OLD.id;
END;
$$;

COMMENT ON FUNCTION public.signature_events_block_update() IS
    'Unconditionally blocks UPDATE on the audit trail, including for the service role.';

DROP TRIGGER IF EXISTS signature_events_block_update_trg ON public.signature_events;
CREATE TRIGGER signature_events_block_update_trg
    BEFORE UPDATE ON public.signature_events
    FOR EACH ROW
    EXECUTE FUNCTION public.signature_events_block_update();

-- ---- RLS: SELECT and INSERT only. UPDATE/DELETE policies are intentionally absent. ---
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'signature_events' AND policyname = 'Agents can select events of their requests') THEN
        CREATE POLICY "Agents can select events of their requests"
        ON public.signature_events
        FOR SELECT TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.signature_requests sr
                JOIN public.clients c ON c.id = sr.client_id
                WHERE sr.id = signature_events.request_id
                  AND c.agent_id = auth.uid()
            )
        );
    END IF;

    -- Authenticated inserts must be attributable. Public signing events carry
    -- performed_by = NULL and are inserted server-side, bypassing this policy.
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'signature_events' AND policyname = 'Agents can insert events for their requests') THEN
        CREATE POLICY "Agents can insert events for their requests"
        ON public.signature_events
        FOR INSERT TO authenticated
        WITH CHECK (
            performed_by = auth.uid()
            AND EXISTS (
                SELECT 1 FROM public.signature_requests sr
                JOIN public.clients c ON c.id = sr.client_id
                WHERE sr.id = signature_events.request_id
                  AND c.agent_id = auth.uid()
            )
        );
    END IF;
END $$;


-- =====================================================================================
-- SECTION 7 — signature_delivery_attempts
-- Delivery log. Deliberately honest about what we actually know.
--
-- DECISION: destination is stored MASKED (for example "j***@example.com",
--   "***-***-1234"). The full address already lives on the signer row and on the
--   client record; duplicating it into a log adds PII exposure without adding
--   information. The masking itself is a service-layer contract — the database cannot
--   verify it — so this is documented, not enforced.
--
-- DECISION: manual channels can never claim 'delivered'. Opening WhatsApp or the SMS
--   composer proves nothing about receipt, so the CHECK below makes the lie
--   impossible. If a real provider API is integrated later, that CHECK must be
--   relaxed by a separate migration.
-- =====================================================================================

CREATE TABLE IF NOT EXISTS public.signature_delivery_attempts (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id         UUID NOT NULL REFERENCES public.signature_requests(id) ON DELETE CASCADE,
    signer_id          UUID NOT NULL REFERENCES public.signature_request_signers(id) ON DELETE CASCADE,
    channel            TEXT NOT NULL,
    destination        TEXT,
    status             TEXT NOT NULL,
    provider_reference TEXT,
    attempted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at       TIMESTAMPTZ,
    error_message      TEXT,
    metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,

    CONSTRAINT signature_delivery_attempts_channel_check
        CHECK (channel IN ('email', 'whatsapp', 'sms', 'copy_link')),
    CONSTRAINT signature_delivery_attempts_status_check
        CHECK (status IN ('prepared', 'opened', 'sent', 'failed', 'delivered', 'unknown')),
    CONSTRAINT signature_delivery_attempts_metadata_check
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT signature_delivery_attempts_completed_at_check
        CHECK (completed_at IS NULL OR completed_at >= attempted_at),
    -- V1 has no delivery-receipt provider on these channels, so 'delivered' would be a lie.
    CONSTRAINT signature_delivery_attempts_manual_not_delivered_check
        CHECK (NOT (channel IN ('whatsapp', 'sms', 'copy_link') AND status = 'delivered'))
);

ALTER TABLE public.signature_delivery_attempts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS signature_delivery_attempts_request_id_idx
    ON public.signature_delivery_attempts(request_id);
CREATE INDEX IF NOT EXISTS signature_delivery_attempts_signer_id_idx
    ON public.signature_delivery_attempts(signer_id);
CREATE INDEX IF NOT EXISTS signature_delivery_attempts_status_idx
    ON public.signature_delivery_attempts(status);
CREATE INDEX IF NOT EXISTS signature_delivery_attempts_attempted_at_idx
    ON public.signature_delivery_attempts(attempted_at);

COMMENT ON TABLE public.signature_delivery_attempts IS
    'Delivery log per channel. WhatsApp/SMS/copy_link are manual in V1 and can never be marked delivered (enforced by CHECK).';
COMMENT ON COLUMN public.signature_delivery_attempts.destination IS
    'MASKED destination only (e.g. "j***@example.com", "***-***-1234"). The full value stays on the signer/client record. Masking is a service-layer contract.';
COMMENT ON COLUMN public.signature_delivery_attempts.status IS
    'prepared = link/message built. opened = the app or link was opened; proves nothing about receipt. sent = handed to a provider. delivered = a provider confirmed receipt (email only in V1). failed / unknown as named.';

-- ---- RLS: SELECT/INSERT/UPDATE. No DELETE policy: this is a log. --------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'signature_delivery_attempts' AND policyname = 'Agents can select delivery attempts of their requests') THEN
        CREATE POLICY "Agents can select delivery attempts of their requests"
        ON public.signature_delivery_attempts
        FOR SELECT TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.signature_requests sr
                JOIN public.clients c ON c.id = sr.client_id
                WHERE sr.id = signature_delivery_attempts.request_id
                  AND c.agent_id = auth.uid()
            )
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'signature_delivery_attempts' AND policyname = 'Agents can insert delivery attempts for their requests') THEN
        CREATE POLICY "Agents can insert delivery attempts for their requests"
        ON public.signature_delivery_attempts
        FOR INSERT TO authenticated
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.signature_requests sr
                JOIN public.clients c ON c.id = sr.client_id
                WHERE sr.id = signature_delivery_attempts.request_id
                  AND c.agent_id = auth.uid()
            )
        );
    END IF;

    -- Needed to move an attempt from prepared -> opened / failed.
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'signature_delivery_attempts' AND policyname = 'Agents can update delivery attempts of their requests') THEN
        CREATE POLICY "Agents can update delivery attempts of their requests"
        ON public.signature_delivery_attempts
        FOR UPDATE TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.signature_requests sr
                JOIN public.clients c ON c.id = sr.client_id
                WHERE sr.id = signature_delivery_attempts.request_id
                  AND c.agent_id = auth.uid()
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.signature_requests sr
                JOIN public.clients c ON c.id = sr.client_id
                WHERE sr.id = signature_delivery_attempts.request_id
                  AND c.agent_id = auth.uid()
            )
        );
    END IF;
END $$;


-- =====================================================================================
-- SECTION 8 — signature_files
-- Metadata for every artifact in the two private buckets. The bytes live in Storage;
-- the hash, the ownership chain and the type live here.
-- No UPDATE policy at all. DELETE is limited to signature_image / original_snapshot,
-- and a trigger blocks removal of signed_document / audit_certificate even on cascade.
-- =====================================================================================

CREATE TABLE IF NOT EXISTS public.signature_files (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id     UUID NOT NULL REFERENCES public.signature_requests(id) ON DELETE CASCADE,
    signer_id      UUID REFERENCES public.signature_request_signers(id) ON DELETE SET NULL,
    file_type      TEXT NOT NULL,
    storage_bucket TEXT NOT NULL,
    storage_path   TEXT NOT NULL UNIQUE,
    mime_type      TEXT NOT NULL,
    size_bytes     BIGINT,
    sha256_hash    TEXT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT signature_files_file_type_check
        CHECK (file_type IN ('signature_image', 'original_snapshot', 'signed_document', 'audit_certificate')),
    CONSTRAINT signature_files_bucket_check
        CHECK (storage_bucket IN ('signatures', 'signed-documents')),
    -- Each artifact type lives in exactly one bucket.
    CONSTRAINT signature_files_bucket_type_check
        CHECK (
            (file_type = 'signature_image' AND storage_bucket = 'signatures')
            OR (file_type IN ('original_snapshot', 'signed_document', 'audit_certificate') AND storage_bucket = 'signed-documents')
        ),
    -- And carries exactly one family of MIME types.
    CONSTRAINT signature_files_mime_type_check
        CHECK (
            (file_type = 'signature_image' AND mime_type IN ('image/png', 'image/webp'))
            OR (file_type = 'original_snapshot' AND mime_type IN ('application/json', 'application/pdf'))
            OR (file_type IN ('signed_document', 'audit_certificate') AND mime_type = 'application/pdf')
        ),
    CONSTRAINT signature_files_sha256_check
        CHECK (sha256_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT signature_files_size_check
        CHECK (size_bytes IS NULL OR size_bytes >= 0)
);

ALTER TABLE public.signature_files ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS signature_files_request_id_idx
    ON public.signature_files(request_id);
CREATE INDEX IF NOT EXISTS signature_files_signer_id_idx
    ON public.signature_files(signer_id);
CREATE INDEX IF NOT EXISTS signature_files_file_type_idx
    ON public.signature_files(file_type);
CREATE INDEX IF NOT EXISTS signature_files_request_type_idx
    ON public.signature_files(request_id, file_type);

COMMENT ON TABLE public.signature_files IS
    'Metadata for artifacts stored in the private signatures / signed-documents buckets. Rows are never updated; signed evidence is never deleted.';
COMMENT ON COLUMN public.signature_files.storage_path IS
    'Full object path inside storage_bucket. First segment is always the owning agent uid, matching the Storage RLS rule.';
COMMENT ON COLUMN public.signature_files.sha256_hash IS
    'Lowercase hex SHA-256 of the stored bytes, so tampering is detectable independently of Storage.';

CREATE OR REPLACE FUNCTION public.signature_files_guard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Fires on cascade too, so a request deletion can never quietly take evidence with it.
    IF OLD.file_type IN ('signed_document', 'audit_certificate') THEN
        RAISE EXCEPTION 'file % is signed evidence (%) and cannot be deleted', OLD.id, OLD.file_type;
    END IF;
    RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.signature_files_guard_delete() IS
    'Blocks deletion of signed_document / audit_certificate rows, including via ON DELETE CASCADE. Applies to the service role too.';

DROP TRIGGER IF EXISTS signature_files_guard_delete_trg ON public.signature_files;
CREATE TRIGGER signature_files_guard_delete_trg
    BEFORE DELETE ON public.signature_files
    FOR EACH ROW
    EXECUTE FUNCTION public.signature_files_guard_delete();

-- ---- RLS: SELECT/INSERT/DELETE. No UPDATE policy: file rows are write-once. ----------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'signature_files' AND policyname = 'Agents can select files of their requests') THEN
        CREATE POLICY "Agents can select files of their requests"
        ON public.signature_files
        FOR SELECT TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.signature_requests sr
                JOIN public.clients c ON c.id = sr.client_id
                WHERE sr.id = signature_files.request_id
                  AND c.agent_id = auth.uid()
            )
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'signature_files' AND policyname = 'Agents can insert files for their requests') THEN
        CREATE POLICY "Agents can insert files for their requests"
        ON public.signature_files
        FOR INSERT TO authenticated
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.signature_requests sr
                JOIN public.clients c ON c.id = sr.client_id
                WHERE sr.id = signature_files.request_id
                  AND c.agent_id = auth.uid()
            )
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'signature_files' AND policyname = 'Agents can delete non evidence files of their requests') THEN
        CREATE POLICY "Agents can delete non evidence files of their requests"
        ON public.signature_files
        FOR DELETE TO authenticated
        USING (
            file_type IN ('signature_image', 'original_snapshot')
            AND EXISTS (
                SELECT 1 FROM public.signature_requests sr
                JOIN public.clients c ON c.id = sr.client_id
                WHERE sr.id = signature_files.request_id
                  AND c.agent_id = auth.uid()
            )
        );
    END IF;
END $$;


-- =====================================================================================
-- SECTION 9 — PRIVATE STORAGE BUCKETS
--
-- Two new buckets. policy-documents is left completely untouched and is never reused
-- for signature artifacts.
--
--   signatures/
--     {agent_id}/{client_id}/{request_id}/{signer_id}/signature.png
--   signed-documents/
--     {agent_id}/{client_id}/{request_id}/signed-document.pdf
--     {agent_id}/{client_id}/{request_id}/audit-certificate.pdf
--
-- Size limits: a signature bitmap is a few tens of KB, so 2 MB is already generous and
-- keeps a hostile upload from parking 20 MB per signer. Signed PDFs reuse the project's
-- existing 20 MB ceiling.
-- =====================================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'signatures',
    'signatures',
    FALSE,
    2097152, -- 2 MB
    ARRAY['image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public             = EXCLUDED.public,
    file_size_limit    = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'signed-documents',
    'signed-documents',
    FALSE,
    20971520, -- 20 MB, same ceiling as the existing policy-documents bucket
    ARRAY['application/pdf', 'application/json']
)
ON CONFLICT (id) DO UPDATE SET
    public             = EXCLUDED.public,
    file_size_limit    = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;


-- =====================================================================================
-- SECTION 10 — STORAGE RLS
--
-- Same rule the project already uses for policy-documents: the first path segment must
-- be the caller's uid.
--
-- Deliberately SELECT-only for authenticated users. Everything in these buckets is
-- produced by the signing server (signature bitmaps come from the public signer, PDFs
-- come from the generator), so agents need to read but never to write. Granting no
-- INSERT/UPDATE/DELETE policy means a compromised browser session cannot forge or
-- alter a signature artifact — only the service role can write here.
--
-- Not implemented, on purpose: validating the {request_id} path segment against
-- signature_requests. It would require casting split_part(name, '/', 3) to uuid, and
-- Postgres gives no guarantee that a regex guard is evaluated before the cast, so a
-- single malformed object name could error out every Storage query against the bucket.
-- Since object names here are built exclusively server-side, the uid-prefix rule plus
-- the signature_files ownership chain already covers this. Revisit only if a safe
-- path-parsing helper is added.
-- =====================================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'signatures_storage_select'
    ) THEN
        CREATE POLICY "signatures_storage_select" ON storage.objects
        FOR SELECT TO authenticated
        USING (
            bucket_id = 'signatures'
            AND auth.uid()::text = split_part(name, '/', 1)
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'signed_documents_storage_select'
    ) THEN
        CREATE POLICY "signed_documents_storage_select" ON storage.objects
        FOR SELECT TO authenticated
        USING (
            bucket_id = 'signed-documents'
            AND auth.uid()::text = split_part(name, '/', 1)
        );
    END IF;
END $$;


-- =====================================================================================
-- SECTION 11 — POST-INSTALL VERIFICATION (read-only; safe to run any time)
--
--   -- All 7 tables exist and have RLS on:
--   SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public'
--     AND tablename IN ('consent_templates','consent_template_versions','signature_requests',
--                       'signature_request_signers','signature_events',
--                       'signature_delivery_attempts','signature_files')
--   ORDER BY tablename;
--
--   -- Every policy created by this module, per operation:
--   SELECT tablename, policyname, cmd, roles FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename LIKE ANY (ARRAY['consent_%','signature_%'])
--   ORDER BY tablename, cmd;
--
--   -- No policy is permissive to anon and none uses USING (true):
--   SELECT tablename, policyname, qual FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename LIKE ANY (ARRAY['consent_%','signature_%'])
--     AND (qual = 'true' OR 'anon' = ANY(roles));
--   -- expected: 0 rows
--
--   -- Both buckets exist and are private:
--   SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets
--   WHERE id IN ('signatures','signed-documents');
--   -- expected: public = false for both
--
--   -- The pre-existing bucket was not touched:
--   SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'policy-documents';
--
--   -- Triggers installed by this module:
--   SELECT event_object_table, trigger_name, action_timing, event_manipulation
--   FROM information_schema.triggers
--   WHERE trigger_schema = 'public'
--     AND event_object_table LIKE ANY (ARRAY['consent_%','signature_%'])
--   ORDER BY event_object_table, trigger_name;
--
-- ROLLBACK: see docs/electronic-signatures/rollback-guide.md.
--           Nothing in this file executes a rollback.
-- =====================================================================================
