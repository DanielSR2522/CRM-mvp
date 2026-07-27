-- =====================================================================================
-- SmarTrack CRM — Policy Expiration Reminders Migration
-- File:    migration_policy_expiration_reminders.sql
--
-- WHAT THIS MIGRATION DOES:
--   1. Creates `public.policy_expiration_reminders` delivery history table.
--   2. Enforces unique constraint preventing duplicate successful/pending sends.
--   3. Configures performance indexes for agent_id, policy_id, and delivery_status.
--   4. Configures RLS policies allowing agents to SELECT only their own history records.
-- =====================================================================================

-- 1. POLICY EXPIRATION REMINDERS TABLE
-- =====================================================================================
CREATE TABLE IF NOT EXISTS public.policy_expiration_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id UUID NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reminder_days INTEGER NOT NULL,
    policy_expiration_date DATE NOT NULL,
    recipient_email TEXT NOT NULL,
    delivery_status TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'resend',
    provider_message_id TEXT NULL,
    error_message TEXT NULL,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT policy_expiration_reminders_days_check CHECK (reminder_days IN (30, 15)),
    CONSTRAINT policy_expiration_reminders_status_check CHECK (delivery_status IN ('pending', 'sent', 'failed', 'skipped'))
);

-- Enable RLS
ALTER TABLE public.policy_expiration_reminders ENABLE ROW LEVEL SECURITY;

-- 2. ATOMIC DUPLICATE PREVENTION UNIQUE INDEX
-- =====================================================================================
-- Ensures that only one pending or sent reminder can exist per policy, expiration date, and interval.
-- Prevents duplicate sends across overlapping cron runs, retries, or function invocations.
CREATE UNIQUE INDEX IF NOT EXISTS policy_expiration_reminders_unique_sent_idx
    ON public.policy_expiration_reminders(policy_id, policy_expiration_date, reminder_days)
    WHERE delivery_status IN ('pending', 'sent');

-- 3. PERFORMANCE INDEXES
-- =====================================================================================
CREATE INDEX IF NOT EXISTS policy_expiration_reminders_policy_id_idx ON public.policy_expiration_reminders(policy_id);
CREATE INDEX IF NOT EXISTS policy_expiration_reminders_agent_id_idx ON public.policy_expiration_reminders(agent_id);
CREATE INDEX IF NOT EXISTS policy_expiration_reminders_reminder_days_idx ON public.policy_expiration_reminders(reminder_days);
CREATE INDEX IF NOT EXISTS policy_expiration_reminders_delivery_status_idx ON public.policy_expiration_reminders(delivery_status);
CREATE INDEX IF NOT EXISTS policy_expiration_reminders_attempted_at_idx ON public.policy_expiration_reminders(attempted_at);
CREATE INDEX IF NOT EXISTS policy_expiration_reminders_expiration_date_idx ON public.policy_expiration_reminders(policy_expiration_date);

-- 4. ROW LEVEL SECURITY POLICIES (Idempotent)
-- =====================================================================================
DO $$
BEGIN
    DROP POLICY IF EXISTS "Agents can select their own reminder history" ON public.policy_expiration_reminders;
    CREATE POLICY "Agents can select their own reminder history" ON public.policy_expiration_reminders
        FOR SELECT TO authenticated
        USING (agent_id = auth.uid());
END $$;
