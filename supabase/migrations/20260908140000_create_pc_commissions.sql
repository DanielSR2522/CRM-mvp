-- =====================================================================================
-- SmarTrack CRM — P&C Commission Payments Table & RLS Policies
-- Migration: 20260908140000_create_pc_commissions.sql
-- =====================================================================================

CREATE TABLE IF NOT EXISTS public.pc_commission_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    policy_id UUID NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
    policy_number TEXT NOT NULL,
    carrier TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    payment_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'PAID' CHECK (status IN ('PAID', 'PENDING', 'NEEDS_REVIEW', 'VOID')),
    source_document_url TEXT,
    source_text TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for duplicate checks and fast agent lookups
CREATE INDEX IF NOT EXISTS idx_pc_commission_payments_agent ON public.pc_commission_payments(agent_id);
CREATE INDEX IF NOT EXISTS idx_pc_commission_payments_policy ON public.pc_commission_payments(policy_id);
CREATE INDEX IF NOT EXISTS idx_pc_commission_payments_dup_check ON public.pc_commission_payments(policy_id, amount, payment_date);

-- Enable RLS
ALTER TABLE public.pc_commission_payments ENABLE ROW LEVEL SECURITY;

-- Standard RLS Policies
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'pc_commission_payments' AND policyname = 'Agent can select own pc_commission_payments'
    ) THEN
        CREATE POLICY "Agent can select own pc_commission_payments" ON public.pc_commission_payments
            FOR SELECT USING (
                agent_id = auth.uid() OR
                agent_id IN (
                    SELECT id FROM public.agents WHERE user_id = auth.uid()
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'pc_commission_payments' AND policyname = 'Agent can insert own pc_commission_payments'
    ) THEN
        CREATE POLICY "Agent can insert own pc_commission_payments" ON public.pc_commission_payments
            FOR INSERT WITH CHECK (
                agent_id = auth.uid() OR
                agent_id IN (
                    SELECT id FROM public.agents WHERE user_id = auth.uid()
                )
            );
    END IF;
END $$;
