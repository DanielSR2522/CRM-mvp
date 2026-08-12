-- =====================================================================================
-- SmarTrack CRM — Daily Policy Expiration Reminders pg_cron Activation
-- File: supabase/migrations/20260815000005_activate_daily_policy_reminder_cron.sql
-- =====================================================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Unschedule previous job if exists (Idempotent)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-policy-expiration-reminders') THEN
        PERFORM cron.unschedule('daily-policy-expiration-reminders');
    END IF;
END $$;

-- 3. Schedule daily job at 12:00 UTC (08:00 AM America/New_York EDT)
SELECT cron.schedule(
    'daily-policy-expiration-reminders',
    '0 12 * * *',
    $$
    SELECT net.http_post(
        url:='https://walgdtoolzpdhgxzejph.supabase.co/functions/v1/send-policy-expiration-reminders',
        headers:='{"Content-Type": "application/json", "x-cron-secret": "b3a27f6e4d5c1a0b9876543210abcdef"}'::jsonb,
        body:='{"dry_run": false}'::jsonb
    ) as request_id;
    $$
);
