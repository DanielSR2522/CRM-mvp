-- =====================================================================================
-- Migration: migration_client_deletion_rpc.sql
-- Description: Enables full atomic transactional client cascade deletion
-- =====================================================================================

-- 1. Update signature_requests_client_id_fkey to ON DELETE CASCADE
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'signature_requests_client_id_fkey'
          AND table_name = 'signature_requests'
    ) THEN
        ALTER TABLE public.signature_requests
            DROP CONSTRAINT signature_requests_client_id_fkey;
    END IF;

    ALTER TABLE public.signature_requests
        ADD CONSTRAINT signature_requests_client_id_fkey
        FOREIGN KEY (client_id)
        REFERENCES public.clients(id)
        ON DELETE CASCADE;
END $$;

-- 2. Update signature_requests_guard_delete() to check GUC setting
CREATE OR REPLACE FUNCTION public.signature_requests_guard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF current_setting('app.override_signature_delete_guard', true) IS DISTINCT FROM 'true' THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'signature request % has status "%" and cannot be deleted. Cancel it instead.', OLD.id, OLD.status;
        END IF;
    END IF;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS signature_requests_guard_delete_trg ON public.signature_requests;
CREATE TRIGGER signature_requests_guard_delete_trg
    BEFORE DELETE ON public.signature_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.signature_requests_guard_delete();

-- 3. Update signature_files_guard_delete() to check GUC setting
CREATE OR REPLACE FUNCTION public.signature_files_guard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF current_setting('app.override_signature_delete_guard', true) IS DISTINCT FROM 'true' THEN
        IF OLD.file_type IN ('signed_document', 'audit_certificate') THEN
            RAISE EXCEPTION 'file % is signed evidence (%) and cannot be deleted', OLD.id, OLD.file_type;
        END IF;
    END IF;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS signature_files_guard_delete_trg ON public.signature_files;
CREATE TRIGGER signature_files_guard_delete_trg
    BEFORE DELETE ON public.signature_files
    FOR EACH ROW
    EXECUTE FUNCTION public.signature_files_guard_delete();

-- 4. Create SECURITY DEFINER RPC delete_client_cascade
CREATE OR REPLACE FUNCTION public.delete_client_cascade(
    p_client_id UUID,
    p_agent_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_deleted_client_id UUID;
BEGIN
    -- 1. Ownership & existence check
    IF NOT EXISTS (
        SELECT 1
        FROM public.clients
        WHERE id = p_client_id
          AND agent_id = p_agent_id
    ) THEN
        RAISE EXCEPTION 'CLIENT_NOT_FOUND_OR_UNAUTHORIZED';
    END IF;

    -- 2. Set transaction-local GUC flag to allow authorized deletion of protected signature requests and signed evidence files
    PERFORM set_config('app.override_signature_delete_guard', 'true', true);

    -- 3. Delete signature files referencing signature requests for this client
    IF to_regclass('public.signature_files') IS NOT NULL AND to_regclass('public.signature_requests') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.signature_files WHERE request_id IN (SELECT id FROM public.signature_requests WHERE client_id = $1)' USING p_client_id;
    END IF;

    -- 4. Delete signature requests (all statuses)
    IF to_regclass('public.signature_requests') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.signature_requests WHERE client_id = $1' USING p_client_id;
    END IF;

    -- 5. Delete client consents
    IF to_regclass('public.client_consents') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.client_consents WHERE client_id = $1' USING p_client_id;
    END IF;

    -- 6. Delete activity events
    IF to_regclass('public.activity_events') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.activity_events WHERE client_id = $1' USING p_client_id;
    END IF;

    -- 7. Delete client notes if table exists
    IF to_regclass('public.notes') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.notes WHERE client_id = $1' USING p_client_id;
    END IF;

    IF to_regclass('public.client_notes') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.client_notes WHERE client_id = $1' USING p_client_id;
    END IF;

    -- 8. Delete Health Policies & sub-tables
    IF to_regclass('public.health_policies') IS NOT NULL THEN
        -- Tax household members
        IF to_regclass('public.tax_household_members') IS NOT NULL THEN
            EXECUTE 'DELETE FROM public.tax_household_members WHERE client_id = $1 OR health_policy_id IN (SELECT id FROM public.health_policies WHERE client_id = $1)' USING p_client_id;
        END IF;

        -- Health policy note attachments
        IF to_regclass('public.health_policy_note_attachments') IS NOT NULL AND to_regclass('public.health_policy_notes') IS NOT NULL THEN
            EXECUTE 'DELETE FROM public.health_policy_note_attachments WHERE note_id IN (SELECT hpn.id FROM public.health_policy_notes hpn JOIN public.health_policies hp ON hpn.health_policy_id = hp.id WHERE hp.client_id = $1)' USING p_client_id;
        END IF;

        -- Health policy notes
        IF to_regclass('public.health_policy_notes') IS NOT NULL THEN
            EXECUTE 'DELETE FROM public.health_policy_notes WHERE health_policy_id IN (SELECT id FROM public.health_policies WHERE client_id = $1)' USING p_client_id;
        END IF;

        -- Health policy documents
        IF to_regclass('public.health_policy_documents') IS NOT NULL THEN
            EXECUTE 'DELETE FROM public.health_policy_documents WHERE health_policy_id IN (SELECT id FROM public.health_policies WHERE client_id = $1)' USING p_client_id;
        END IF;

        -- Health policies
        EXECUTE 'DELETE FROM public.health_policies WHERE client_id = $1' USING p_client_id;
    END IF;

    -- 9. Delete P&C / Life / Supplemental Policies & sub-tables
    IF to_regclass('public.policies') IS NOT NULL THEN
        -- Policy note attachments
        IF to_regclass('public.policy_note_attachments') IS NOT NULL AND to_regclass('public.policy_notes') IS NOT NULL THEN
            EXECUTE 'DELETE FROM public.policy_note_attachments WHERE note_id IN (SELECT pn.id FROM public.policy_notes pn JOIN public.policies p ON pn.policy_id = p.id WHERE p.client_id = $1)' USING p_client_id;
        END IF;

        -- Policy notes
        IF to_regclass('public.policy_notes') IS NOT NULL THEN
            EXECUTE 'DELETE FROM public.policy_notes WHERE policy_id IN (SELECT id FROM public.policies WHERE client_id = $1)' USING p_client_id;
        END IF;

        -- Policy documents
        IF to_regclass('public.policy_documents') IS NOT NULL THEN
            EXECUTE 'DELETE FROM public.policy_documents WHERE policy_id IN (SELECT id FROM public.policies WHERE client_id = $1)' USING p_client_id;
        END IF;

        -- Policy commercial links
        IF to_regclass('public.personal_commercial_policy_links') IS NOT NULL THEN
            EXECUTE 'DELETE FROM public.personal_commercial_policy_links WHERE personal_client_id = $1' USING p_client_id;
        END IF;

        -- Policies
        EXECUTE 'DELETE FROM public.policies WHERE client_id = $1' USING p_client_id;
    END IF;

    -- 10. Delete client personal/residence/income sub-tables
    IF to_regclass('public.client_income_information') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.client_income_information WHERE client_id = $1' USING p_client_id;
    END IF;

    IF to_regclass('public.client_residence_information') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.client_residence_information WHERE client_id = $1' USING p_client_id;
    END IF;

    IF to_regclass('public.client_co_applicant_information') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.client_co_applicant_information WHERE client_id = $1' USING p_client_id;
    END IF;

    IF to_regclass('public.client_personal_information') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.client_personal_information WHERE client_id = $1' USING p_client_id;
    END IF;

    -- 11. Delete master client profile
    DELETE FROM public.clients
    WHERE id = p_client_id AND agent_id = p_agent_id
    RETURNING id INTO v_deleted_client_id;

    IF v_deleted_client_id IS NULL THEN
        RAISE EXCEPTION 'CLIENT_DELETE_FAILED';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'client_id', p_client_id
    );
END;
$$;
