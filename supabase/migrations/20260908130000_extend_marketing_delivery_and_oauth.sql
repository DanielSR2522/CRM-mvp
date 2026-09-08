-- Supabase Migration: 20260908130000_extend_marketing_delivery_and_oauth.sql
-- Description: Extends Marketing schema with provider message IDs, unsubscribe tokens, webhook event deduplication, and OAuth token metadata

-- 1. Extend Campaign Recipients with Provider Message ID and Unsubscribe Token
ALTER TABLE public.marketing_campaign_recipients
ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
ADD COLUMN IF NOT EXISTS unsubscribe_token TEXT;

-- 2. Extend Delivery Events with Provider Event ID for Webhook Deduplication
ALTER TABLE public.marketing_delivery_events
ADD COLUMN IF NOT EXISTS provider_event_id TEXT;

-- Index for fast webhook deduplication queries
CREATE INDEX IF NOT EXISTS idx_marketing_events_provider_id ON public.marketing_delivery_events(provider_event_id);
CREATE INDEX IF NOT EXISTS idx_marketing_recipients_provider_msg ON public.marketing_campaign_recipients(provider_message_id);

-- 3. Extend Sender Accounts with OAuth Metadata and Sender Eligibility
ALTER TABLE public.marketing_sender_accounts
ADD COLUMN IF NOT EXISTS provider_account_id TEXT,
ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS disconnected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reply_to_enabled BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS sender_eligibility_status TEXT NOT NULL DEFAULT 'REPLY_TO_ONLY' CHECK (sender_eligibility_status IN ('VERIFIED_FROM', 'REPLY_TO_ONLY', 'INELIGIBLE'));

-- 4. Create OAuth State Session Store Table for CSRF Protection
CREATE TABLE IF NOT EXISTS public.marketing_oauth_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    state TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL CHECK (provider IN ('GOOGLE_OAUTH', 'MICROSOFT_OAUTH')),
    agent_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS for OAuth States
ALTER TABLE public.marketing_oauth_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read marketing_oauth_states" ON public.marketing_oauth_states FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert marketing_oauth_states" ON public.marketing_oauth_states FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated delete marketing_oauth_states" ON public.marketing_oauth_states FOR DELETE TO authenticated USING (true);
