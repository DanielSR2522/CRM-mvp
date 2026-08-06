-- =====================================================================================
-- Migration: migration_life_policies.sql
-- Description: Creates 8 normalized tables for the Life Insurance Module,
--              Row Level Security policies, performance indexes, triggers,
--              and configures the private `life-documents` storage bucket.
-- =====================================================================================

-- 0. UPDATED_AT TRIGGER FUNCTION
-- =====================================================================================
CREATE OR REPLACE FUNCTION public.life_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. CLIENT LIFE PROFILE TABLE (One per client)
-- =====================================================================================
CREATE TABLE IF NOT EXISTS public.client_life_profile (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE UNIQUE,
    health_rating_approved TEXT NULL,
    income NUMERIC(12, 2) NULL,
    profits NUMERIC(12, 2) NULL,
    company_name TEXT NULL,
    owner_employee TEXT NULL,
    net_worth NUMERIC(14, 2) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.client_life_profile ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS client_life_profile_client_id_idx
    ON public.client_life_profile(client_id);

DROP TRIGGER IF EXISTS client_life_profile_updated_at_trg ON public.client_life_profile;
CREATE TRIGGER client_life_profile_updated_at_trg
    BEFORE UPDATE ON public.client_life_profile
    FOR EACH ROW
    EXECUTE FUNCTION public.life_set_updated_at();

-- 2. LIFE POLICIES TABLE (Multiple per client)
-- =====================================================================================
CREATE TABLE IF NOT EXISTS public.life_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    policy_number TEXT NULL,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Pending', 'Cancelled', 'Expired')),
    effective_date DATE NULL,
    expiration_date DATE NULL,
    notes_summary TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.life_policies ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS life_policies_client_id_idx
    ON public.life_policies(client_id);

DROP TRIGGER IF EXISTS life_policies_updated_at_trg ON public.life_policies;
CREATE TRIGGER life_policies_updated_at_trg
    BEFORE UPDATE ON public.life_policies
    FOR EACH ROW
    EXECUTE FUNCTION public.life_set_updated_at();

-- 3. LIFE POLICY PRODUCTS TABLE
-- =====================================================================================
CREATE TABLE IF NOT EXISTS public.life_policy_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    life_policy_id UUID NOT NULL REFERENCES public.life_policies(id) ON DELETE CASCADE,
    product_type TEXT NOT NULL CHECK (product_type IN ('Term', 'IUL', 'Whole Life', 'VUL', 'Term - Disability', 'Costumer Whole Life')),
    company TEXT NULL,
    policy_number TEXT NULL,
    policy_date DATE NULL,
    face_amount NUMERIC(14, 2) NULL DEFAULT 0.00,
    monthly_premium NUMERIC(12, 2) NULL DEFAULT 0.00,
    time_to_pay_premium TEXT NULL,
    level_period TEXT NULL,
    conversion_credit NUMERIC(12, 2) NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.life_policy_products ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS life_policy_products_policy_id_idx
    ON public.life_policy_products(life_policy_id);

DROP TRIGGER IF EXISTS life_policy_products_updated_at_trg ON public.life_policy_products;
CREATE TRIGGER life_policy_products_updated_at_trg
    BEFORE UPDATE ON public.life_policy_products
    FOR EACH ROW
    EXECUTE FUNCTION public.life_set_updated_at();

-- 4. LIFE POLICY BENEFICIARIES TABLE
-- =====================================================================================
CREATE TABLE IF NOT EXISTS public.life_policy_beneficiaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    life_policy_id UUID NOT NULL REFERENCES public.life_policies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    dob DATE NULL,
    relationship_grade TEXT NULL,
    is_client BOOLEAN NOT NULL DEFAULT FALSE,
    phone TEXT NULL,
    email TEXT NULL,
    benefit_percentage NUMERIC(5, 2) NOT NULL CHECK (benefit_percentage >= 0 AND benefit_percentage <= 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.life_policy_beneficiaries ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS life_policy_beneficiaries_policy_id_idx
    ON public.life_policy_beneficiaries(life_policy_id);

DROP TRIGGER IF EXISTS life_policy_beneficiaries_updated_at_trg ON public.life_policy_beneficiaries;
CREATE TRIGGER life_policy_beneficiaries_updated_at_trg
    BEFORE UPDATE ON public.life_policy_beneficiaries
    FOR EACH ROW
    EXECUTE FUNCTION public.life_set_updated_at();

-- 5. LIFE POLICY DOCUMENTS TABLE
-- =====================================================================================
CREATE TABLE IF NOT EXISTS public.life_policy_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    life_policy_id UUID NOT NULL REFERENCES public.life_policies(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    storage_path TEXT NOT NULL UNIQUE,
    file_size BIGINT NULL,
    file_type TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.life_policy_documents ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS life_policy_documents_policy_id_idx
    ON public.life_policy_documents(life_policy_id);

DROP TRIGGER IF EXISTS life_policy_documents_updated_at_trg ON public.life_policy_documents;
CREATE TRIGGER life_policy_documents_updated_at_trg
    BEFORE UPDATE ON public.life_policy_documents
    FOR EACH ROW
    EXECUTE FUNCTION public.life_set_updated_at();

-- 6. LIFE POLICY NOTES TABLE
-- =====================================================================================
CREATE TABLE IF NOT EXISTS public.life_policy_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    life_policy_id UUID NOT NULL REFERENCES public.life_policies(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.life_policy_notes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS life_policy_notes_policy_id_idx
    ON public.life_policy_notes(life_policy_id);

DROP TRIGGER IF EXISTS life_policy_notes_updated_at_trg ON public.life_policy_notes;
CREATE TRIGGER life_policy_notes_updated_at_trg
    BEFORE UPDATE ON public.life_policy_notes
    FOR EACH ROW
    EXECUTE FUNCTION public.life_set_updated_at();

-- 7. LIFE POLICY NOTE ATTACHMENTS TABLE
-- =====================================================================================
CREATE TABLE IF NOT EXISTS public.life_policy_note_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id UUID NOT NULL REFERENCES public.life_policy_notes(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size BIGINT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.life_policy_note_attachments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS life_policy_note_attachments_note_id_idx
    ON public.life_policy_note_attachments(note_id);

-- 8. LIFE POLICY TIMELINE EVENTS TABLE
-- =====================================================================================
CREATE TABLE IF NOT EXISTS public.life_policy_timeline_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    life_policy_id UUID NOT NULL REFERENCES public.life_policies(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NULL,
    event_type TEXT NOT NULL,
    actor_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.life_policy_timeline_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS life_policy_timeline_events_policy_id_idx
    ON public.life_policy_timeline_events(life_policy_id);

-- 9. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================================================

-- client_life_profile RLS
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'client_life_profile' AND policyname = 'Agents can manage life profile of their clients') THEN
        CREATE POLICY "Agents can manage life profile of their clients"
        ON public.client_life_profile FOR ALL
        USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_life_profile.client_id AND c.agent_id = auth.uid()))
        WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_life_profile.client_id AND c.agent_id = auth.uid()));
    END IF;
END $$;

-- life_policies RLS
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'life_policies' AND policyname = 'Agents can manage life policies of their clients') THEN
        CREATE POLICY "Agents can manage life policies of their clients"
        ON public.life_policies FOR ALL
        USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = life_policies.client_id AND c.agent_id = auth.uid()))
        WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = life_policies.client_id AND c.agent_id = auth.uid()));
    END IF;
END $$;

-- life_policy_products RLS
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'life_policy_products' AND policyname = 'Agents can manage life policy products') THEN
        CREATE POLICY "Agents can manage life policy products"
        ON public.life_policy_products FOR ALL
        USING (EXISTS (SELECT 1 FROM public.life_policies lp JOIN public.clients c ON lp.client_id = c.id WHERE lp.id = life_policy_products.life_policy_id AND c.agent_id = auth.uid()))
        WITH CHECK (EXISTS (SELECT 1 FROM public.life_policies lp JOIN public.clients c ON lp.client_id = c.id WHERE lp.id = life_policy_products.life_policy_id AND c.agent_id = auth.uid()));
    END IF;
END $$;

-- life_policy_beneficiaries RLS
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'life_policy_beneficiaries' AND policyname = 'Agents can manage life policy beneficiaries') THEN
        CREATE POLICY "Agents can manage life policy beneficiaries"
        ON public.life_policy_beneficiaries FOR ALL
        USING (EXISTS (SELECT 1 FROM public.life_policies lp JOIN public.clients c ON lp.client_id = c.id WHERE lp.id = life_policy_beneficiaries.life_policy_id AND c.agent_id = auth.uid()))
        WITH CHECK (EXISTS (SELECT 1 FROM public.life_policies lp JOIN public.clients c ON lp.client_id = c.id WHERE lp.id = life_policy_beneficiaries.life_policy_id AND c.agent_id = auth.uid()));
    END IF;
END $$;

-- life_policy_documents RLS
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'life_policy_documents' AND policyname = 'Agents can manage life policy documents') THEN
        CREATE POLICY "Agents can manage life policy documents"
        ON public.life_policy_documents FOR ALL
        USING (EXISTS (SELECT 1 FROM public.life_policies lp JOIN public.clients c ON lp.client_id = c.id WHERE lp.id = life_policy_documents.life_policy_id AND c.agent_id = auth.uid()))
        WITH CHECK (EXISTS (SELECT 1 FROM public.life_policies lp JOIN public.clients c ON lp.client_id = c.id WHERE lp.id = life_policy_documents.life_policy_id AND c.agent_id = auth.uid()));
    END IF;
END $$;

-- life_policy_notes RLS
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'life_policy_notes' AND policyname = 'Agents can manage life policy notes') THEN
        CREATE POLICY "Agents can manage life policy notes"
        ON public.life_policy_notes FOR ALL
        USING (agent_id = auth.uid())
        WITH CHECK (agent_id = auth.uid());
    END IF;
END $$;

-- life_policy_note_attachments RLS
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'life_policy_note_attachments' AND policyname = 'Agents can manage life policy note attachments') THEN
        CREATE POLICY "Agents can manage life policy note attachments"
        ON public.life_policy_note_attachments FOR ALL
        USING (EXISTS (SELECT 1 FROM public.life_policy_notes lpn WHERE lpn.id = life_policy_note_attachments.note_id AND lpn.agent_id = auth.uid()))
        WITH CHECK (EXISTS (SELECT 1 FROM public.life_policy_notes lpn WHERE lpn.id = life_policy_note_attachments.note_id AND lpn.agent_id = auth.uid()));
    END IF;
END $$;

-- life_policy_timeline_events RLS
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'life_policy_timeline_events' AND policyname = 'Agents can view life policy timeline events') THEN
        CREATE POLICY "Agents can view life policy timeline events"
        ON public.life_policy_timeline_events FOR SELECT
        USING (EXISTS (SELECT 1 FROM public.life_policies lp JOIN public.clients c ON lp.client_id = c.id WHERE lp.id = life_policy_timeline_events.life_policy_id AND c.agent_id = auth.uid()));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'life_policy_timeline_events' AND policyname = 'Agents can insert life policy timeline events') THEN
        CREATE POLICY "Agents can insert life policy timeline events"
        ON public.life_policy_timeline_events FOR INSERT
        WITH CHECK (EXISTS (SELECT 1 FROM public.life_policies lp JOIN public.clients c ON lp.client_id = c.id WHERE lp.id = life_policy_timeline_events.life_policy_id AND c.agent_id = auth.uid()));
    END IF;
END $$;

-- 10. PRIVATE STORAGE BUCKET CONFIGURATION FOR LIFE DOCUMENTS
-- =====================================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('life-documents', 'life-documents', false)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated agents life documents insert') THEN
        CREATE POLICY "Authenticated agents life documents insert"
        ON storage.objects FOR INSERT TO authenticated
        WITH CHECK (bucket_id = 'life-documents');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated agents life documents select') THEN
        CREATE POLICY "Authenticated agents life documents select"
        ON storage.objects FOR SELECT TO authenticated
        USING (bucket_id = 'life-documents');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated agents life documents delete') THEN
        CREATE POLICY "Authenticated agents life documents delete"
        ON storage.objects FOR DELETE TO authenticated
        USING (bucket_id = 'life-documents');
    END IF;
END $$;

-- 11. UPDATE CASCADE DELETION RPC FOR LIFE TABLES
-- =====================================================================================
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
    IF NOT EXISTS (
        SELECT 1
        FROM public.clients
        WHERE id = p_client_id
          AND agent_id = p_agent_id
    ) THEN
        RAISE EXCEPTION 'CLIENT_NOT_FOUND_OR_UNAUTHORIZED';
    END IF;

    PERFORM set_config('app.override_signature_delete_guard', 'true', true);

    -- Delete signature files
    IF to_regclass('public.signature_files') IS NOT NULL AND to_regclass('public.signature_requests') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.signature_files WHERE request_id IN (SELECT id FROM public.signature_requests WHERE client_id = $1)' USING p_client_id;
    END IF;

    -- Delete signature requests
    IF to_regclass('public.signature_requests') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.signature_requests WHERE client_id = $1' USING p_client_id;
    END IF;

    -- Delete client consents
    IF to_regclass('public.client_consents') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.client_consents WHERE client_id = $1' USING p_client_id;
    END IF;

    -- Delete activity events
    IF to_regclass('public.activity_events') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.activity_events WHERE client_id = $1' USING p_client_id;
    END IF;

    -- Delete client notes
    IF to_regclass('public.notes') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.notes WHERE client_id = $1' USING p_client_id;
    END IF;

    IF to_regclass('public.client_notes') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.client_notes WHERE client_id = $1' USING p_client_id;
    END IF;

    -- Delete Life Insurance Profile & Policies (with cascading sub-tables)
    IF to_regclass('public.client_life_profile') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.client_life_profile WHERE client_id = $1' USING p_client_id;
    END IF;

    IF to_regclass('public.life_policies') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.life_policies WHERE client_id = $1' USING p_client_id;
    END IF;

    -- Delete Health Policies
    IF to_regclass('public.health_policies') IS NOT NULL THEN
        IF to_regclass('public.tax_household_members') IS NOT NULL THEN
            EXECUTE 'DELETE FROM public.tax_household_members WHERE client_id = $1 OR health_policy_id IN (SELECT id FROM public.health_policies WHERE client_id = $1)' USING p_client_id;
        END IF;

        IF to_regclass('public.health_policy_note_attachments') IS NOT NULL AND to_regclass('public.health_policy_notes') IS NOT NULL THEN
            EXECUTE 'DELETE FROM public.health_policy_note_attachments WHERE note_id IN (SELECT hpn.id FROM public.health_policy_notes hpn JOIN public.health_policies hp ON hpn.health_policy_id = hp.id WHERE hp.client_id = $1)' USING p_client_id;
        END IF;

        IF to_regclass('public.health_policy_notes') IS NOT NULL THEN
            EXECUTE 'DELETE FROM public.health_policy_notes WHERE health_policy_id IN (SELECT id FROM public.health_policies WHERE client_id = $1)' USING p_client_id;
        END IF;

        IF to_regclass('public.health_policy_documents') IS NOT NULL THEN
            EXECUTE 'DELETE FROM public.health_policy_documents WHERE health_policy_id IN (SELECT id FROM public.health_policies WHERE client_id = $1)' USING p_client_id;
        END IF;

        EXECUTE 'DELETE FROM public.health_policies WHERE client_id = $1' USING p_client_id;
    END IF;

    -- Delete P&C Policies
    IF to_regclass('public.policies') IS NOT NULL THEN
        IF to_regclass('public.policy_note_attachments') IS NOT NULL AND to_regclass('public.policy_notes') IS NOT NULL THEN
            EXECUTE 'DELETE FROM public.policy_note_attachments WHERE note_id IN (SELECT pn.id FROM public.policy_notes pn JOIN public.policies p ON pn.policy_id = p.id WHERE p.client_id = $1)' USING p_client_id;
        END IF;

        IF to_regclass('public.policy_notes') IS NOT NULL THEN
            EXECUTE 'DELETE FROM public.policy_notes WHERE policy_id IN (SELECT id FROM public.policies WHERE client_id = $1)' USING p_client_id;
        END IF;

        IF to_regclass('public.policy_documents') IS NOT NULL THEN
            EXECUTE 'DELETE FROM public.policy_documents WHERE policy_id IN (SELECT id FROM public.policies WHERE client_id = $1)' USING p_client_id;
        END IF;

        IF to_regclass('public.personal_commercial_policy_links') IS NOT NULL THEN
            EXECUTE 'DELETE FROM public.personal_commercial_policy_links WHERE personal_client_id = $1' USING p_client_id;
        END IF;

        EXECUTE 'DELETE FROM public.policies WHERE client_id = $1' USING p_client_id;
    END IF;

    -- Delete personal sub-tables
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

    -- Delete master client profile
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
