-- =====================================================================================
-- Migration: 20260817000000_create_medicare_module.sql
-- Description: Additive Medicare Module and Relational Medical Section Tables with RLS
-- =====================================================================================

-- 1. Master Medicare Information Table
CREATE TABLE IF NOT EXISTS public.client_medicare_information (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
    
    -- Scope of Appointment
    scope_of_appointment BOOLEAN DEFAULT NULL,
    soa_date DATE DEFAULT NULL,
    soa_method TEXT DEFAULT NULL,
    
    -- Medicare Details (Left Column)
    mbi TEXT DEFAULT NULL,
    part_a_effective_date DATE DEFAULT NULL,
    part_b_effective_date DATE DEFAULT NULL,
    part_c_subtype TEXT DEFAULT NULL,
    medicaid_level TEXT DEFAULT NULL,
    medicaid_id TEXT DEFAULT NULL,
    
    -- Medicare Details (Right Column)
    renewal_status TEXT DEFAULT NULL,
    company TEXT DEFAULT NULL,
    plan_name TEXT DEFAULT NULL,
    plan_id TEXT DEFAULT NULL,
    plan_effective_date DATE DEFAULT NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index on client_id
CREATE INDEX IF NOT EXISTS idx_client_medicare_info_client_id 
    ON public.client_medicare_information(client_id);

-- Enable RLS
ALTER TABLE public.client_medicare_information ENABLE ROW LEVEL SECURITY;

-- RLS Policies for master Medicare info
DROP POLICY IF EXISTS "Agents select medicare info of accessible clients" ON public.client_medicare_information;
CREATE POLICY "Agents select medicare info of accessible clients"
    ON public.client_medicare_information FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = client_medicare_information.client_id
            AND (c.agent_id = auth.uid() OR public.can_access_agent(c.agent_id))
        )
    );

DROP POLICY IF EXISTS "Agents insert medicare info for accessible clients" ON public.client_medicare_information;
CREATE POLICY "Agents insert medicare info for accessible clients"
    ON public.client_medicare_information FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = client_medicare_information.client_id
            AND (c.agent_id = auth.uid() OR public.can_access_agent(c.agent_id))
        )
    );

DROP POLICY IF EXISTS "Agents update medicare info of accessible clients" ON public.client_medicare_information;
CREATE POLICY "Agents update medicare info of accessible clients"
    ON public.client_medicare_information FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = client_medicare_information.client_id
            AND (c.agent_id = auth.uid() OR public.can_access_agent(c.agent_id))
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = client_medicare_information.client_id
            AND (c.agent_id = auth.uid() OR public.can_access_agent(c.agent_id))
        )
    );

DROP POLICY IF EXISTS "Agents delete medicare info of accessible clients" ON public.client_medicare_information;
CREATE POLICY "Agents delete medicare info of accessible clients"
    ON public.client_medicare_information FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = client_medicare_information.client_id
            AND (c.agent_id = auth.uid() OR public.can_access_agent(c.agent_id))
        )
    );


-- 2. Primary Doctors Table
CREATE TABLE IF NOT EXISTS public.client_medicare_doctors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT DEFAULT NULL,
    phone TEXT DEFAULT NULL,
    specialty TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medicare_doctors_client_id ON public.client_medicare_doctors(client_id);
ALTER TABLE public.client_medicare_doctors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agents manage medicare doctors" ON public.client_medicare_doctors;
CREATE POLICY "Agents manage medicare doctors"
    ON public.client_medicare_doctors FOR ALL
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND (c.agent_id = auth.uid() OR public.can_access_agent(c.agent_id))))
    WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND (c.agent_id = auth.uid() OR public.can_access_agent(c.agent_id))));


-- 3. Hospitals Table
CREATE TABLE IF NOT EXISTS public.client_medicare_hospitals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT DEFAULT NULL,
    phone TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medicare_hospitals_client_id ON public.client_medicare_hospitals(client_id);
ALTER TABLE public.client_medicare_hospitals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agents manage medicare hospitals" ON public.client_medicare_hospitals;
CREATE POLICY "Agents manage medicare hospitals"
    ON public.client_medicare_hospitals FOR ALL
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND (c.agent_id = auth.uid() OR public.can_access_agent(c.agent_id))))
    WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND (c.agent_id = auth.uid() OR public.can_access_agent(c.agent_id))));


-- 4. Urgent Care Centers Table
CREATE TABLE IF NOT EXISTS public.client_medicare_urgent_cares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT DEFAULT NULL,
    phone TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medicare_urgent_cares_client_id ON public.client_medicare_urgent_cares(client_id);
ALTER TABLE public.client_medicare_urgent_cares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agents manage medicare urgent cares" ON public.client_medicare_urgent_cares;
CREATE POLICY "Agents manage medicare urgent cares"
    ON public.client_medicare_urgent_cares FOR ALL
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND (c.agent_id = auth.uid() OR public.can_access_agent(c.agent_id))))
    WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND (c.agent_id = auth.uid() OR public.can_access_agent(c.agent_id))));


-- 5. Pharmacies Table
CREATE TABLE IF NOT EXISTS public.client_medicare_pharmacies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT DEFAULT NULL,
    phone TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medicare_pharmacies_client_id ON public.client_medicare_pharmacies(client_id);
ALTER TABLE public.client_medicare_pharmacies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agents manage medicare pharmacies" ON public.client_medicare_pharmacies;
CREATE POLICY "Agents manage medicare pharmacies"
    ON public.client_medicare_pharmacies FOR ALL
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND (c.agent_id = auth.uid() OR public.can_access_agent(c.agent_id))))
    WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND (c.agent_id = auth.uid() OR public.can_access_agent(c.agent_id))));


-- 6. Medical Conditions Table
CREATE TABLE IF NOT EXISTS public.client_medicare_conditions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    notes TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medicare_conditions_client_id ON public.client_medicare_conditions(client_id);
ALTER TABLE public.client_medicare_conditions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agents manage medicare conditions" ON public.client_medicare_conditions;
CREATE POLICY "Agents manage medicare conditions"
    ON public.client_medicare_conditions FOR ALL
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND (c.agent_id = auth.uid() OR public.can_access_agent(c.agent_id))))
    WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND (c.agent_id = auth.uid() OR public.can_access_agent(c.agent_id))));


-- 7. Medical Specialists Table
CREATE TABLE IF NOT EXISTS public.client_medicare_specialists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    specialty TEXT DEFAULT NULL,
    address TEXT DEFAULT NULL,
    phone TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medicare_specialists_client_id ON public.client_medicare_specialists(client_id);
ALTER TABLE public.client_medicare_specialists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agents manage medicare specialists" ON public.client_medicare_specialists;
CREATE POLICY "Agents manage medicare specialists"
    ON public.client_medicare_specialists FOR ALL
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND (c.agent_id = auth.uid() OR public.can_access_agent(c.agent_id))))
    WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND (c.agent_id = auth.uid() OR public.can_access_agent(c.agent_id))));


-- 8. Medications Table
CREATE TABLE IF NOT EXISTS public.client_medicare_medications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    dosage TEXT DEFAULT NULL,
    frequency TEXT DEFAULT NULL,
    instructions TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medicare_medications_client_id ON public.client_medicare_medications(client_id);
ALTER TABLE public.client_medicare_medications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agents manage medicare medications" ON public.client_medicare_medications;
CREATE POLICY "Agents manage medicare medications"
    ON public.client_medicare_medications FOR ALL
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND (c.agent_id = auth.uid() OR public.can_access_agent(c.agent_id))))
    WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND (c.agent_id = auth.uid() OR public.can_access_agent(c.agent_id))));

NOTIFY pgrst, 'reload schema';
