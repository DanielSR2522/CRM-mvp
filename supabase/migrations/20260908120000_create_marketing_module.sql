-- Supabase Migration: 20260908120000_create_marketing_module.sql
-- Description: Creates full database schema for Marketing Module (Campaigns, Segments, Templates, Recipients, Events, Suppressions, Sender Accounts, Automations)

-- 1. Marketing Segments
CREATE TABLE IF NOT EXISTS public.marketing_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    filters JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_system BOOLEAN NOT NULL DEFAULT false,
    agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Marketing Templates
CREATE TABLE IF NOT EXISTS public.marketing_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Custom' CHECK (category IN (
        'Renewal', 'Payment Reminder', 'Welcome', 'Lead Follow-up', 
        'Reactivation', 'Referral Request', 'Birthday', 'Promotion', 
        'Announcement', 'Custom'
    )),
    subject TEXT,
    body_html TEXT NOT NULL DEFAULT '',
    is_system BOOLEAN NOT NULL DEFAULT false,
    is_favorite BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DRAFT', 'ARCHIVED')),
    agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Marketing Campaigns
CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'EMAIL' CHECK (channel IN ('EMAIL', 'WHATSAPP', 'SMS')),
    subject TEXT,
    preview_text TEXT,
    from_name TEXT,
    from_email TEXT,
    reply_to TEXT,
    segment_id UUID REFERENCES public.marketing_segments(id) ON DELETE SET NULL,
    template_id UUID REFERENCES public.marketing_templates(id) ON DELETE SET NULL,
    content_html TEXT,
    content_text TEXT,
    scheduled_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
        'DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'PAUSED', 'FAILED', 'CANCELLED'
    )),
    total_matched INTEGER NOT NULL DEFAULT 0,
    valid_recipients INTEGER NOT NULL DEFAULT 0,
    excluded_duplicates INTEGER NOT NULL DEFAULT 0,
    excluded_invalid_email INTEGER NOT NULL DEFAULT 0,
    excluded_unsubscribed INTEGER NOT NULL DEFAULT 0,
    excluded_bounced INTEGER NOT NULL DEFAULT 0,
    agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Marketing Campaign Recipients
CREATE TABLE IF NOT EXISTS public.marketing_campaign_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
    recipient_email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'EXCLUDED')),
    exclusion_reason TEXT,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Marketing Delivery Events
CREATE TABLE IF NOT EXISTS public.marketing_delivery_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
    recipient_id UUID REFERENCES public.marketing_campaign_recipients(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'COMPLAINED', 'UNSUBSCRIBED', 'FAILED'
    )),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Marketing Suppressions
CREATE TABLE IF NOT EXISTS public.marketing_suppressions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    reason TEXT NOT NULL CHECK (reason IN ('UNSUBSCRIBE', 'GLOBAL_SUPPRESSION', 'HARD_BOUNCE', 'COMPLAINT', 'MANUAL')),
    details TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Marketing Sender Accounts
CREATE TABLE IF NOT EXISTS public.marketing_sender_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('GOOGLE_OAUTH', 'MICROSOFT_OAUTH', 'SMTP_RELAY', 'CUSTOM_DOMAIN')),
    from_name TEXT NOT NULL,
    from_email TEXT NOT NULL,
    reply_to TEXT,
    is_default BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'DISCONNECTED' CHECK (status IN ('CONNECTED', 'DISCONNECTED', 'NEEDS_REAUTH', 'VERIFYING')),
    spf_status TEXT NOT NULL DEFAULT 'NOT_CHECKED' CHECK (spf_status IN ('VERIFIED', 'FAILED', 'NOT_CHECKED')),
    dkim_status TEXT NOT NULL DEFAULT 'NOT_CHECKED' CHECK (dkim_status IN ('VERIFIED', 'FAILED', 'NOT_CHECKED')),
    dmarc_status TEXT NOT NULL DEFAULT 'NOT_CHECKED' CHECK (dmarc_status IN ('VERIFIED', 'FAILED', 'NOT_CHECKED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Marketing Automations
CREATE TABLE IF NOT EXISTS public.marketing_automations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    trigger_type TEXT NOT NULL CHECK (trigger_type IN (
        'NEW_LEAD', 'NO_RESPONSE_X_DAYS', 'RENEWAL_APPROACHING', 
        'POLICY_CANCELLED', 'PAYMENT_PENDING', 'BIRTHDAY', 
        'CLIENT_INACTIVE', 'SALE_COMPLETED'
    )),
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'PAUSED')),
    template_id UUID REFERENCES public.marketing_templates(id) ON DELETE SET NULL,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_agent ON public.marketing_campaigns(agent_id);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_status ON public.marketing_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_marketing_recipients_campaign ON public.marketing_campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_marketing_events_campaign ON public.marketing_delivery_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_marketing_events_type ON public.marketing_delivery_events(event_type);
CREATE INDEX IF NOT EXISTS idx_marketing_suppressions_email ON public.marketing_suppressions(email);
CREATE INDEX IF NOT EXISTS idx_marketing_segments_agent ON public.marketing_segments(agent_id);
CREATE INDEX IF NOT EXISTS idx_marketing_templates_agent ON public.marketing_templates(agent_id);

-- Enable RLS
ALTER TABLE public.marketing_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_delivery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_sender_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_automations ENABLE ROW LEVEL SECURITY;

-- Permissive RLS Policies (Agent/Authenticated access)
CREATE POLICY "Allow authenticated read marketing_segments" ON public.marketing_segments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert marketing_segments" ON public.marketing_segments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update marketing_segments" ON public.marketing_segments FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow authenticated read marketing_templates" ON public.marketing_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert marketing_templates" ON public.marketing_templates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update marketing_templates" ON public.marketing_templates FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow authenticated read marketing_campaigns" ON public.marketing_campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert marketing_campaigns" ON public.marketing_campaigns FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update marketing_campaigns" ON public.marketing_campaigns FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow authenticated read marketing_campaign_recipients" ON public.marketing_campaign_recipients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert marketing_campaign_recipients" ON public.marketing_campaign_recipients FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated read marketing_delivery_events" ON public.marketing_delivery_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert marketing_delivery_events" ON public.marketing_delivery_events FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated read marketing_suppressions" ON public.marketing_suppressions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert marketing_suppressions" ON public.marketing_suppressions FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated read marketing_sender_accounts" ON public.marketing_sender_accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert marketing_sender_accounts" ON public.marketing_sender_accounts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update marketing_sender_accounts" ON public.marketing_sender_accounts FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow authenticated read marketing_automations" ON public.marketing_automations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert marketing_automations" ON public.marketing_automations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update marketing_automations" ON public.marketing_automations FOR UPDATE TO authenticated USING (true);
