-- =====================================================================================
-- SmarTrack CRM — P&C Shared Access for Commissions & Policy Expiration Reminders
-- Migration: 20260915000000_pc_shared_access_commissions_and_reminders.sql
-- =====================================================================================

-- 1. Helper function for P&C shared access check
CREATE OR REPLACE FUNCTION public.can_access_pc_agent(target_agent_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NULL OR target_agent_id IS NULL THEN
        RETURN FALSE;
    END IF;

    IF target_agent_id = auth.uid() THEN
        RETURN TRUE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.agent_shared_access
        WHERE ((agent_id = auth.uid() AND shared_agent_id = target_agent_id)
           OR (shared_agent_id = auth.uid() AND agent_id = target_agent_id))
          AND (scope = 'property_casualty' OR scope = 'all')
    );
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_pc_agent(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_pc_agent(UUID) TO authenticated;

-- 2. Update RLS policies on pc_commission_payments
ALTER TABLE public.pc_commission_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agent can select own pc_commission_payments" ON public.pc_commission_payments;
DROP POLICY IF EXISTS "Agents select owned or shared PC commission payments" ON public.pc_commission_payments;
CREATE POLICY "Agents select owned or shared PC commission payments"
    ON public.pc_commission_payments FOR SELECT
    TO authenticated
    USING (
        agent_id = auth.uid()
        OR public.can_access_pc_agent(agent_id)
    );

DROP POLICY IF EXISTS "Agent can update own pc_commission_payments" ON public.pc_commission_payments;
DROP POLICY IF EXISTS "Agents update owned or shared PC commission payments" ON public.pc_commission_payments;
CREATE POLICY "Agents update owned or shared PC commission payments"
    ON public.pc_commission_payments FOR UPDATE
    TO authenticated
    USING (
        agent_id = auth.uid()
        OR public.can_access_pc_agent(agent_id)
    )
    WITH CHECK (
        agent_id = auth.uid()
        OR public.can_access_pc_agent(agent_id)
    );

-- 3. Update unique index on policy_expiration_reminders to include recipient_email
DROP INDEX IF EXISTS public.policy_expiration_reminders_unique_sent_idx;
CREATE UNIQUE INDEX IF NOT EXISTS policy_expiration_reminders_unique_sent_idx
    ON public.policy_expiration_reminders(policy_id, policy_expiration_date, reminder_days, recipient_email)
    WHERE delivery_status IN ('pending', 'sent');

-- 4. Update RLS on policy_expiration_reminders
ALTER TABLE public.policy_expiration_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agents can select their own reminder history" ON public.policy_expiration_reminders;
DROP POLICY IF EXISTS "Agents select owned or shared PC reminder history" ON public.policy_expiration_reminders;
CREATE POLICY "Agents select owned or shared PC reminder history"
    ON public.policy_expiration_reminders FOR SELECT
    TO authenticated
    USING (
        agent_id = auth.uid()
        OR public.can_access_pc_agent(agent_id)
    );

NOTIFY pgrst, 'reload schema';
