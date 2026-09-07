-- =====================================================================================
-- SmarTrack CRM — WhatsApp Cloud API: schema additions
-- File:    migration_whatsapp_cloud_api.sql
-- Branch:  codex/universal-import-mapper
-- Follows: migration_signatures_token_reissue.sql (must already be applied)
--
-- WHY THIS EXISTS
--   The original migration_electronic_signatures.sql was written when WhatsApp
--   delivery was a manual wa.me link. Two CHECK constraints encoded that assumption:
--
--     1. signature_events.event_type did not include 'whatsapp_sent' because the
--        old flow had no real send event — only 'whatsapp_link_opened'.
--
--     2. signature_delivery_attempts_manual_not_delivered_check prevented any
--        whatsapp-channel row from ever reaching 'delivered', because opening
--        wa.me proves nothing about receipt.
--
--   WhatsApp Cloud API changes both facts:
--
--     1. A Cloud API send produces a definite, auditable event — the Meta WAMID
--        that proves the message was accepted. 'whatsapp_sent' is that event.
--
--     2. Cloud API is a real provider. Meta webhook callbacks genuinely confirm
--        sent → delivered → read transitions. Blocking 'delivered' for whatsapp
--        would make it impossible to record those confirmed states truthfully.
--
-- WHAT IT CHANGES — exactly two things
--   1. Widens signature_events.event_type CHECK by one value: 'whatsapp_sent'.
--   2. Relaxes signature_delivery_attempts_manual_not_delivered_check so that
--      only 'sms' and 'copy_link' are barred from claiming 'delivered'.
--      WhatsApp is removed from that list because Cloud API can prove delivery.
--
-- WHAT IT DOES NOT TOUCH
--   No table is created, dropped, renamed or restructured.
--   No column is added or altered.
--   No RLS policy is created, dropped or modified.
--   No existing audit row is touched.
--   No other function, trigger, bucket or storage policy.
--
-- IDEMPOTENCY
--   The DO blocks check whether the new constraint already exists before acting.
--   Re-running is safe.
--
-- HOW TO RUN
--   Review first. Paste into the Supabase SQL Editor and run as one script.
--
-- ROLLBACK
--   See ROLLBACK section at the bottom. Note: rolling back while any
--   'whatsapp_sent' events exist will fail — that is intentional.
-- =====================================================================================


-- =====================================================================================
-- SECTION 0 — PREFLIGHT
-- =====================================================================================

DO $$
BEGIN
    IF to_regclass('public.signature_events') IS NULL THEN
        RAISE EXCEPTION 'Aborting: public.signature_events not found. Run migration_electronic_signatures.sql first.';
    END IF;

    IF to_regclass('public.signature_delivery_attempts') IS NULL THEN
        RAISE EXCEPTION 'Aborting: public.signature_delivery_attempts not found. Run migration_electronic_signatures.sql first.';
    END IF;

    -- Verify that migration_signatures_token_reissue.sql has already been applied
    -- by checking for the 'link_issued' event type that it introduced.
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.check_constraints
        WHERE constraint_schema = 'public'
          AND constraint_name = 'signature_events_event_type_check'
          AND check_clause LIKE '%link_issued%'
    ) THEN
        RAISE EXCEPTION 'Aborting: migration_signatures_token_reissue.sql does not appear to have been applied (link_issued not in event_type CHECK). Apply it first.';
    END IF;
END $$;


-- =====================================================================================
-- SECTION 1 — AUDIT: 'whatsapp_sent' event type
--
-- A WhatsApp Cloud API send is a definite event: Meta accepted the message and
-- returned a WAMID. Recording this as 'whatsapp_link_opened' would be a lie —
-- the link was not merely opened, it was delivered to Meta's infrastructure.
-- A new value, 'whatsapp_sent', names the fact correctly.
-- =====================================================================================

DO $$
BEGIN
    -- Already applied? Skip silently.
    IF EXISTS (
        SELECT 1
        FROM information_schema.check_constraints
        WHERE constraint_schema = 'public'
          AND constraint_name = 'signature_events_event_type_check'
          AND check_clause LIKE '%whatsapp_sent%'
    ) THEN
        RAISE NOTICE 'signature_events_event_type_check already includes whatsapp_sent — skipping.';
        RETURN;
    END IF;

    ALTER TABLE public.signature_events
        DROP CONSTRAINT IF EXISTS signature_events_event_type_check;

    ALTER TABLE public.signature_events
        ADD CONSTRAINT signature_events_event_type_check
        CHECK (event_type IN (
            -- original values (migration_electronic_signatures.sql)
            'request_created',
            'request_updated',
            'request_sent',
            'email_sent',
            'email_failed',
            'whatsapp_link_opened',   -- wa.me / manual link opened
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
            -- added by migration_signatures_token_reissue.sql
            'link_issued',
            'link_revoked',
            -- added by this migration
            'whatsapp_sent'           -- Cloud API accepted the message; WAMID stored
        ));

    RAISE NOTICE 'signature_events_event_type_check updated: whatsapp_sent added.';
END $$;


-- =====================================================================================
-- SECTION 2 — DELIVERY ATTEMPTS: allow Cloud API to report 'delivered' for whatsapp
--
-- The original constraint prevented whatsapp/sms/copy_link from ever claiming
-- 'delivered', because wa.me/SMS openers prove nothing about receipt. That
-- reasoning still holds for sms and copy_link, which remain manual channels.
--
-- WhatsApp Cloud API is different: Meta sends a webhook callback when the
-- message is delivered (status = 'delivered') and when it is read (status = 'read').
-- These are confirmed delivery facts, not guesses. Blocking them would force the
-- webhook to lie or to discard confirmable information.
--
-- The new constraint removes 'whatsapp' from the manual-channel list while keeping
-- 'sms' and 'copy_link' correctly restricted.
-- =====================================================================================

DO $$
BEGIN
    -- Check if the constraint already reflects the new rule (whatsapp not in the list).
    -- We detect this by checking whether the constraint still mentions whatsapp in the
    -- "manual_not_delivered" clause. If whatsapp is absent, we have already applied.
    IF EXISTS (
        SELECT 1
        FROM information_schema.check_constraints
        WHERE constraint_schema = 'public'
          AND constraint_name = 'signature_delivery_attempts_manual_not_delivered_check'
          AND check_clause NOT LIKE '%whatsapp%'
    ) THEN
        RAISE NOTICE 'signature_delivery_attempts_manual_not_delivered_check already updated — skipping.';
        RETURN;
    END IF;

    ALTER TABLE public.signature_delivery_attempts
        DROP CONSTRAINT IF EXISTS signature_delivery_attempts_manual_not_delivered_check;

    -- sms and copy_link remain manual — they still cannot claim 'delivered'.
    -- whatsapp is removed because Cloud API is a real provider with confirmed callbacks.
    ALTER TABLE public.signature_delivery_attempts
        ADD CONSTRAINT signature_delivery_attempts_manual_not_delivered_check
        CHECK (
            NOT (channel IN ('sms', 'copy_link') AND status = 'delivered')
        );

    RAISE NOTICE 'signature_delivery_attempts_manual_not_delivered_check updated: whatsapp removed from manual-only list.';
END $$;


-- =====================================================================================
-- SECTION 3 — INDEX: fast webhook lookup by provider_reference
--
-- The webhook handler needs to find a delivery attempt by its Meta WAMID.
-- Without an index this is a full table scan on every webhook event.
-- provider_reference is already nullable; we only index non-null values.
-- =====================================================================================

CREATE INDEX IF NOT EXISTS signature_delivery_attempts_provider_reference_idx
    ON public.signature_delivery_attempts(provider_reference)
    WHERE provider_reference IS NOT NULL;

COMMENT ON INDEX public.signature_delivery_attempts_provider_reference_idx IS
    'Speeds up webhook lookups by Meta WAMID (provider_reference). Added by migration_whatsapp_cloud_api.sql.';


-- =====================================================================================
-- ROLLBACK
-- =====================================================================================
--
-- To revert this migration:
--
-- STEP 1: Verify no 'whatsapp_sent' events exist (rollback fails if they do).
--
--   SELECT COUNT(*) FROM public.signature_events WHERE event_type = 'whatsapp_sent';
--   -- Must be 0 before continuing.
--
-- STEP 2: Restore the event_type constraint without 'whatsapp_sent'.
--
--   ALTER TABLE public.signature_events
--       DROP CONSTRAINT IF EXISTS signature_events_event_type_check;
--
--   ALTER TABLE public.signature_events
--       ADD CONSTRAINT signature_events_event_type_check
--       CHECK (event_type IN (
--           'request_created','request_updated','request_sent',
--           'email_sent','email_failed','whatsapp_link_opened','sms_link_opened',
--           'secure_link_copied','document_viewed','consent_accepted',
--           'signature_started','document_signed','document_declined',
--           'request_expired','request_cancelled','final_document_generated',
--           'final_document_failed','document_downloaded','delivery_failed',
--           'link_issued','link_revoked'
--       ));
--
-- STEP 3: Restore the manual-not-delivered constraint with whatsapp included.
--
--   ALTER TABLE public.signature_delivery_attempts
--       DROP CONSTRAINT IF EXISTS signature_delivery_attempts_manual_not_delivered_check;
--
--   ALTER TABLE public.signature_delivery_attempts
--       ADD CONSTRAINT signature_delivery_attempts_manual_not_delivered_check
--       CHECK (NOT (channel IN ('whatsapp', 'sms', 'copy_link') AND status = 'delivered'));
--
-- STEP 4: Drop the index (optional — it is harmless to leave it).
--
--   DROP INDEX IF EXISTS public.signature_delivery_attempts_provider_reference_idx;
--
-- =====================================================================================
