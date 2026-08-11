-- Migration: Create client_payment_information table with owner-only RLS policies
CREATE TABLE IF NOT EXISTS public.client_payment_information (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES auth.users(id),

    -- Common static fields
    auto_pay BOOLEAN NOT NULL DEFAULT false,
    payment_day INTEGER CHECK (payment_day IS NULL OR (payment_day >= 1 AND payment_day <= 31)),
    associated_address TEXT,
    account_holder_name TEXT,

    -- Bank method fields
    has_bank_account BOOLEAN NOT NULL DEFAULT false,
    bank_name TEXT,
    routing_number_encrypted TEXT,
    account_number_encrypted TEXT,
    bank_last4 TEXT,

    -- Card method fields
    has_card BOOLEAN NOT NULL DEFAULT false,
    card_type TEXT CHECK (card_type IS NULL OR card_type IN ('Debit', 'Credit')),
    card_number_encrypted TEXT,
    card_last4 TEXT,
    expiration_month TEXT,
    expiration_year TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.client_payment_information ENABLE ROW LEVEL SECURITY;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS client_payment_info_client_idx ON public.client_payment_information(client_id);
CREATE INDEX IF NOT EXISTS client_payment_info_agent_idx ON public.client_payment_information(agent_id);

-- STRICT OWNER-ONLY RLS POLICIES (NO can_access_agent, NO shared P&C access)

DROP POLICY IF EXISTS "Agents select payment info owner only" ON public.client_payment_information;
CREATE POLICY "Agents select payment info owner only"
    ON public.client_payment_information FOR SELECT
    TO authenticated
    USING (
        agent_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = client_payment_information.client_id
              AND c.agent_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Agents insert payment info owner only" ON public.client_payment_information;
CREATE POLICY "Agents insert payment info owner only"
    ON public.client_payment_information FOR INSERT
    TO authenticated
    WITH CHECK (
        agent_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = client_payment_information.client_id
              AND c.agent_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Agents update payment info owner only" ON public.client_payment_information;
CREATE POLICY "Agents update payment info owner only"
    ON public.client_payment_information FOR UPDATE
    TO authenticated
    USING (
        agent_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = client_payment_information.client_id
              AND c.agent_id = auth.uid()
        )
    )
    WITH CHECK (
        agent_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = client_payment_information.client_id
              AND c.agent_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Agents delete payment info owner only" ON public.client_payment_information;
CREATE POLICY "Agents delete payment info owner only"
    ON public.client_payment_information FOR DELETE
    TO authenticated
    USING (
        agent_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = client_payment_information.client_id
              AND c.agent_id = auth.uid()
        )
    );
