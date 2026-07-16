-- =====================================================================================
-- SmarTrack CRM — Electronic Signatures: token issue / reissue / revoke
-- File:    migration_signatures_token_reissue.sql
-- Branch:  feature/electronic-signatures
-- Follows: migration_electronic_signatures.sql (must already be applied)
--
-- WHY THIS EXISTS
--   migration_electronic_signatures.sql made token_hash write-once:
--
--     IF NEW.token_hash IS DISTINCT FROM OLD.token_hash THEN
--         RAISE EXCEPTION 'token_hash cannot be rotated ...';
--     END IF;
--
--   That rule was too blunt. It correctly protects a signer who has already
--   signed, but it also makes it impossible to reissue a link for a signer who
--   has done nothing at all — and since the raw token is deliberately never
--   stored, a sent consent's link could never be rebuilt, resent, or replaced
--   after a leak. The only escape was to cancel the consent and start over.
--
--   This migration draws the line where it actually belongs: a token may be
--   replaced while there is no evidence to protect, and becomes immutable the
--   instant the signer signs or declines.
--
-- WHAT IT CHANGES — exactly two things
--   1. Replaces the body of public.signature_request_signers_guard_signing().
--      Every existing rule is kept verbatim; only the token_hash rule changes.
--   2. Widens the CHECK on signature_events.event_type by two values,
--      'link_issued' and 'link_revoked', so a reissue is auditable.
--
-- WHAT IT DOES NOT TOUCH
--   No table is created, dropped, renamed or restructured. No column is added or
--   altered. No RLS policy is created, dropped or modified. No bucket, no storage
--   policy, no other function, no other trigger. migration_electronic_signatures.sql
--   is not edited — this file stands alongside it, following the project's
--   convention of hand-executed .sql files in the repository root.
--
-- HOW TO RUN
--   Review first. Then paste into the Supabase SQL Editor and run as one script.
--   It is idempotent: re-running it is a no-op.
--
-- ROLLBACK
--   See the ROLLBACK section at the bottom of this file. Reverting is a
--   CREATE OR REPLACE back to the old body plus a constraint swap; it destroys no
--   data. Note that reverting while any 'link_issued' or 'link_revoked' event
--   exists would fail — that is intentional, and the rollback section explains it.
-- =====================================================================================


-- =====================================================================================
-- SECTION 0 — PREFLIGHT
-- Refuse to run against a database this migration was not written for.
-- =====================================================================================

DO $$
BEGIN
    IF to_regclass('public.signature_request_signers') IS NULL THEN
        RAISE EXCEPTION 'Aborting: public.signature_request_signers not found. Run migration_electronic_signatures.sql first.';
    END IF;

    IF to_regclass('public.signature_events') IS NULL THEN
        RAISE EXCEPTION 'Aborting: public.signature_events not found. Run migration_electronic_signatures.sql first.';
    END IF;

    IF to_regclass('public.signature_requests') IS NULL THEN
        RAISE EXCEPTION 'Aborting: public.signature_requests not found. Run migration_electronic_signatures.sql first.';
    END IF;

    -- The function we are about to replace must already exist. If it does not,
    -- the base migration was never applied and replacing it here would install a
    -- guard with no trigger attached — a silent, dangerous no-op.
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE pronamespace = 'public'::regnamespace
          AND proname = 'signature_request_signers_guard_signing'
    ) THEN
        RAISE EXCEPTION 'Aborting: public.signature_request_signers_guard_signing() not found. Run migration_electronic_signatures.sql first.';
    END IF;

    -- And its trigger must still be wired up, otherwise nothing below has effect.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE trigger_schema = 'public'
          AND event_object_table = 'signature_request_signers'
          AND trigger_name = 'signature_request_signers_guard_signing_trg'
    ) THEN
        RAISE EXCEPTION 'Aborting: trigger signature_request_signers_guard_signing_trg is missing. The signer guard is not active; investigate before continuing.';
    END IF;
END $$;


-- =====================================================================================
-- SECTION 1 — AUDIT: two new event types
--
-- A token that can be replaced must leave a trail, otherwise "the link changed"
-- becomes unexplainable after the fact. Two values are enough:
--
--   link_issued   — a signing link was created for a signer (first time or after
--                   a revocation). Carries the new hash prefix, never the token.
--   link_revoked  — the current link was killed. A reissue emits link_revoked for
--                   the old one and link_issued for the new one, in that order,
--                   so the sequence reads as what actually happened.
--
-- This only widens the allowed set. No existing row can violate a wider CHECK, so
-- the constraint validates without touching data.
-- =====================================================================================

DO $$
BEGIN
    -- Skip entirely if a previous run already widened it.
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.signature_events'::regclass
          AND conname = 'signature_events_event_type_check'
          AND pg_get_constraintdef(oid) LIKE '%link_issued%'
    ) THEN
        RAISE NOTICE 'signature_events_event_type_check already includes link_issued; skipping.';
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.signature_events'::regclass
          AND conname = 'signature_events_event_type_check'
    ) THEN
        ALTER TABLE public.signature_events
            DROP CONSTRAINT signature_events_event_type_check;
    END IF;

    ALTER TABLE public.signature_events
        ADD CONSTRAINT signature_events_event_type_check
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
            'delivery_failed',
            -- Added by migration_signatures_token_reissue.sql:
            'link_issued',
            'link_revoked'
        ));
END $$;


-- =====================================================================================
-- SECTION 2 — THE SIGNER GUARD, CORRECTED
--
-- Every rule from the original function is preserved word for word. The only
-- change is the token_hash rule at the end, which used to be an unconditional
-- refusal and is now scoped to the cases where a token actually protects
-- something.
--
-- Rotation is permitted only when ALL of the following hold:
--   * the signer has not signed          (OLD.signed_at IS NULL)
--   * the signer has not declined        (OLD.declined_at IS NULL)
--   * the new token is not born revoked  (NEW.token_revoked_at IS NULL)
--   * the parent request is still live   (status in draft/pending/sent/viewed)
--
-- The last check is a cross-table read on purpose. Without it, a cancelled or
-- expired consent could have a working link minted for it, which would resurrect
-- a document the agent had deliberately killed. Making that a database guarantee
-- means no future API route can get it wrong.
--
-- Not SECURITY DEFINER, matching every other function in this module: it runs as
-- the caller, so RLS still applies to the request it reads.
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.signature_request_signers_guard_signing()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_request_status TEXT;
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

    -- ---- Token rotation --------------------------------------------------
    -- Replacing token_hash is how a link is issued, reissued and implicitly
    -- revoked: lookup happens by hash, so the moment the hash changes, every
    -- previously handed-out link stops resolving. That is the revocation.
    IF NEW.token_hash IS DISTINCT FROM OLD.token_hash THEN

        -- Once there is evidence, the token that produced it is part of the
        -- record and can never be swapped out from under it.
        IF OLD.signed_at IS NOT NULL THEN
            RAISE EXCEPTION 'token_hash cannot be rotated for signer %: this signer has already signed', OLD.id;
        END IF;

        IF OLD.declined_at IS NOT NULL THEN
            RAISE EXCEPTION 'token_hash cannot be rotated for signer %: this signer has already declined', OLD.id;
        END IF;

        -- A freshly issued token must be live. Issuing one already revoked would
        -- be a contradiction, and almost certainly a bug in the caller.
        IF NEW.token_revoked_at IS NOT NULL THEN
            RAISE EXCEPTION 'a newly issued token for signer % cannot be revoked at the same time', OLD.id;
        END IF;

        -- The link belongs to the request. If the request is over, so is the link.
        SELECT sr.status INTO v_request_status
        FROM public.signature_requests sr
        WHERE sr.id = OLD.request_id;

        IF v_request_status IS NULL THEN
            RAISE EXCEPTION 'cannot issue a link for signer %: its request is not visible', OLD.id;
        END IF;

        IF v_request_status NOT IN ('draft', 'pending', 'sent', 'viewed') THEN
            RAISE EXCEPTION 'cannot issue a link for signer %: the request is "%"', OLD.id, v_request_status;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.signature_request_signers_guard_signing() IS
    'Prevents replay, double-signature, signing on a revoked/declined token, and any edit of signature evidence after the fact. Allows token_hash rotation only while the signer has neither signed nor declined and the parent request is still live, so links can be reissued without ever touching evidence. Applies to the service role too.';

-- The trigger is already attached from the base migration and points at this
-- function by name, so replacing the body is enough. Recreating it anyway keeps
-- this file self-sufficient if the trigger were ever dropped by hand.
DROP TRIGGER IF EXISTS signature_request_signers_guard_signing_trg ON public.signature_request_signers;
CREATE TRIGGER signature_request_signers_guard_signing_trg
    BEFORE UPDATE ON public.signature_request_signers
    FOR EACH ROW
    EXECUTE FUNCTION public.signature_request_signers_guard_signing();


-- =====================================================================================
-- SECTION 3 — VERIFICATION (read-only; safe to run any time)
--
--   -- The new event types are allowed:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'public.signature_events'::regclass
--     AND conname = 'signature_events_event_type_check';
--   -- expected: the list contains link_issued and link_revoked
--
--   -- The guard is the new one:
--   SELECT prosrc LIKE '%has already signed%' AS is_new_version
--   FROM pg_proc
--   WHERE pronamespace = 'public'::regnamespace
--     AND proname = 'signature_request_signers_guard_signing';
--   -- expected: true
--
--   -- The trigger is attached:
--   SELECT trigger_name, action_timing, event_manipulation
--   FROM information_schema.triggers
--   WHERE trigger_schema = 'public'
--     AND event_object_table = 'signature_request_signers';
--   -- expected: signature_request_signers_guard_signing_trg, BEFORE, UPDATE
--
--   -- Nothing else moved. These must be unchanged from the base migration:
--   SELECT count(*) FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename LIKE ANY (ARRAY['consent_%','signature_%']);
--   SELECT id, public FROM storage.buckets
--   WHERE id IN ('signatures','signed-documents','policy-documents');
--   -- expected: all three buckets still public = false
--
-- BEHAVIOURAL CHECK (safe, transactional — nothing is kept)
--
--   BEGIN;
--   -- Rotating an untouched signer's token now succeeds:
--   UPDATE public.signature_request_signers
--   SET token_hash = repeat('a', 64)
--   WHERE signed_at IS NULL AND declined_at IS NULL
--   LIMIT 1;
--   -- expected: UPDATE 1
--   ROLLBACK;
--
--   BEGIN;
--   -- Rotating a signed signer's token still fails, as it must:
--   UPDATE public.signature_request_signers
--   SET token_hash = repeat('b', 64)
--   WHERE signed_at IS NOT NULL
--   LIMIT 1;
--   -- expected: ERROR ... has already signed
--   ROLLBACK;
-- =====================================================================================


-- =====================================================================================
-- ROLLBACK  (documented, NOT executed — do not run this by accident)
--
-- Reverting restores the write-once token rule. Do this only if reissuing links
-- turns out to be the wrong call; it does not delete or alter any row.
--
-- Step 1 — restore the original guard body:
--
--   CREATE OR REPLACE FUNCTION public.signature_request_signers_guard_signing()
--   RETURNS TRIGGER
--   LANGUAGE plpgsql
--   AS $$
--   BEGIN
--       IF OLD.token_revoked_at IS NOT NULL AND OLD.signed_at IS NULL AND NEW.signed_at IS NOT NULL THEN
--           RAISE EXCEPTION 'signer % has a revoked token and cannot sign', OLD.id;
--       END IF;
--       IF OLD.declined_at IS NOT NULL AND NEW.signed_at IS NOT NULL THEN
--           RAISE EXCEPTION 'signer % already declined and cannot sign', OLD.id;
--       END IF;
--       IF OLD.signed_at IS NOT NULL THEN
--           IF NEW.signed_at IS DISTINCT FROM OLD.signed_at THEN
--               RAISE EXCEPTION 'signer % already signed; signed_at is immutable', OLD.id;
--           END IF;
--           IF NEW.signature_method IS DISTINCT FROM OLD.signature_method
--              OR NEW.signature_image_path IS DISTINCT FROM OLD.signature_image_path
--              OR NEW.typed_signature IS DISTINCT FROM OLD.typed_signature
--              OR NEW.consent_accepted_at IS DISTINCT FROM OLD.consent_accepted_at
--              OR NEW.consent_text_snapshot IS DISTINCT FROM OLD.consent_text_snapshot
--              OR NEW.full_name IS DISTINCT FROM OLD.full_name THEN
--               RAISE EXCEPTION 'signature evidence for signer % is immutable once signed', OLD.id;
--           END IF;
--       END IF;
--       IF NEW.token_hash IS DISTINCT FROM OLD.token_hash THEN
--           RAISE EXCEPTION 'token_hash cannot be rotated for signer %; create a new request instead', OLD.id;
--       END IF;
--       RETURN NEW;
--   END;
--   $$;
--
-- Step 2 — narrow the event CHECK back:
--
--   WARNING: this fails if any link_issued or link_revoked event already exists,
--   because a narrower CHECK is validated against existing rows. That is the
--   right behaviour, not an obstacle to work around: those rows are audit
--   records of links that really were issued, and deleting them to satisfy a
--   constraint would be falsifying the trail. If you hit this, decide
--   deliberately whether reverting is still what you want.
--
--   Check first:
--     SELECT event_type, count(*) FROM public.signature_events
--     WHERE event_type IN ('link_issued','link_revoked') GROUP BY event_type;
--
--   If that returns 0 rows:
--     ALTER TABLE public.signature_events DROP CONSTRAINT signature_events_event_type_check;
--     ALTER TABLE public.signature_events ADD CONSTRAINT signature_events_event_type_check
--     CHECK (event_type IN (
--         'request_created','request_updated','request_sent','email_sent','email_failed',
--         'whatsapp_link_opened','sms_link_opened','secure_link_copied','document_viewed',
--         'consent_accepted','signature_started','document_signed','document_declined',
--         'request_expired','request_cancelled','final_document_generated',
--         'final_document_failed','document_downloaded','delivery_failed'
--     ));
--
--   Leaving the CHECK wide while the guard is narrow is harmless: the extra
--   values simply stop being written.
-- =====================================================================================
