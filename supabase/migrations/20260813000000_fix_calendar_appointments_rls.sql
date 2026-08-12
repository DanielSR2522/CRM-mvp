-- =====================================================================================
-- SmarTrack CRM — Fix Calendar Appointments RLS Policies
-- File: supabase/migrations/20260813000000_fix_calendar_appointments_rls.sql
--
-- WHAT THIS MIGRATION DOES:
--   1. Cleanly drops all legacy/conflicting RLS policies on `calendar_appointments`.
--   2. Re-establishes explicit, secure RLS policies for SELECT, INSERT, UPDATE, DELETE.
--   3. Guarantees that authenticated agents can insert appointments owned by themselves (`agent_id = auth.uid()`),
--      with `client_id` validation ensuring the linked client is accessible to the agent in the CRM
--      without requiring an arbitrary P&C policy filter that rejected valid appointments.
-- =====================================================================================

ALTER TABLE public.calendar_appointments ENABLE ROW LEVEL SECURITY;

-- 1. DROP ALL LEGACY & CONFLICTING POLICIES
DROP POLICY IF EXISTS "Agents can select appointments" ON public.calendar_appointments;
DROP POLICY IF EXISTS "Agents select appointments owner only" ON public.calendar_appointments;
DROP POLICY IF EXISTS "Agents can select their own appointments" ON public.calendar_appointments;
DROP POLICY IF EXISTS "Agents select calendar_appointments owner or shared" ON public.calendar_appointments;

DROP POLICY IF EXISTS "Agents can insert appointments" ON public.calendar_appointments;
DROP POLICY IF EXISTS "Agents insert appointments owner only" ON public.calendar_appointments;
DROP POLICY IF EXISTS "Agents can insert their own appointments" ON public.calendar_appointments;
DROP POLICY IF EXISTS "Agents insert calendar_appointments owner or shared" ON public.calendar_appointments;

DROP POLICY IF EXISTS "Agents can update appointments" ON public.calendar_appointments;
DROP POLICY IF EXISTS "Agents update appointments owner only" ON public.calendar_appointments;
DROP POLICY IF EXISTS "Agents can update their own appointments" ON public.calendar_appointments;
DROP POLICY IF EXISTS "Agents update calendar_appointments owner or shared" ON public.calendar_appointments;

DROP POLICY IF EXISTS "Agents can delete appointments" ON public.calendar_appointments;
DROP POLICY IF EXISTS "Agents delete appointments owner only" ON public.calendar_appointments;
DROP POLICY IF EXISTS "Agents can delete their own appointments" ON public.calendar_appointments;
DROP POLICY IF EXISTS "Agents delete calendar_appointments owner or shared" ON public.calendar_appointments;

-- 2. CREATE CANONICAL, SECURE RLS POLICIES FOR CALENDAR APPOINTMENTS

-- SELECT: Agents can view their own appointments
CREATE POLICY "Agents select appointments owner only"
ON public.calendar_appointments FOR SELECT
TO authenticated
USING (agent_id = auth.uid());

-- INSERT: Agents can create appointments owned by themselves, for accessible clients or general events
CREATE POLICY "Agents insert appointments owner only"
ON public.calendar_appointments FOR INSERT
TO authenticated
WITH CHECK (
    agent_id = auth.uid()
    AND (
        client_id IS NULL
        OR EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = client_id
            AND (
                c.agent_id = auth.uid()
                OR can_access_agent(c.agent_id, 'property_casualty')
            )
        )
    )
);

-- UPDATE: Agents can update their own appointments
CREATE POLICY "Agents update appointments owner only"
ON public.calendar_appointments FOR UPDATE
TO authenticated
USING (agent_id = auth.uid())
WITH CHECK (
    agent_id = auth.uid()
    AND (
        client_id IS NULL
        OR EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = client_id
            AND (
                c.agent_id = auth.uid()
                OR can_access_agent(c.agent_id, 'property_casualty')
            )
        )
    )
);

-- DELETE: Agents can delete their own appointments
CREATE POLICY "Agents delete appointments owner only"
ON public.calendar_appointments FOR DELETE
TO authenticated
USING (agent_id = auth.uid());
