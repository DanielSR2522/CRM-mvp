-- Migration: Create Health Medical Section Tables
-- Timestamp: 20260823000000_create_health_medical_tables.sql

-- 1. Primary Doctors
CREATE TABLE IF NOT EXISTS public.client_health_doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_policy_id UUID NOT NULL REFERENCES public.health_policies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  doctor_name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  specialty TEXT,
  npi TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Hospitals
CREATE TABLE IF NOT EXISTS public.client_health_hospitals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_policy_id UUID NOT NULL REFERENCES public.health_policies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  hospital_name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Urgent Care
CREATE TABLE IF NOT EXISTS public.client_health_urgent_cares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_policy_id UUID NOT NULL REFERENCES public.health_policies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  urgent_care_name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Pharmacies
CREATE TABLE IF NOT EXISTS public.client_health_pharmacies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_policy_id UUID NOT NULL REFERENCES public.health_policies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  pharmacy_name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Conditions
CREATE TABLE IF NOT EXISTS public.client_health_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_policy_id UUID NOT NULL REFERENCES public.health_policies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  condition_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Specialists
CREATE TABLE IF NOT EXISTS public.client_health_specialists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_policy_id UUID NOT NULL REFERENCES public.health_policies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  specialist_name TEXT NOT NULL,
  specialty TEXT,
  address TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Medicines
CREATE TABLE IF NOT EXISTS public.client_health_medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_policy_id UUID NOT NULL REFERENCES public.health_policies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  medication_name TEXT NOT NULL,
  dosage TEXT,
  frequency TEXT,
  instructions TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_client_health_doctors_hp ON public.client_health_doctors(health_policy_id);
CREATE INDEX IF NOT EXISTS idx_client_health_hospitals_hp ON public.client_health_hospitals(health_policy_id);
CREATE INDEX IF NOT EXISTS idx_client_health_urgent_cares_hp ON public.client_health_urgent_cares(health_policy_id);
CREATE INDEX IF NOT EXISTS idx_client_health_pharmacies_hp ON public.client_health_pharmacies(health_policy_id);
CREATE INDEX IF NOT EXISTS idx_client_health_conditions_hp ON public.client_health_conditions(health_policy_id);
CREATE INDEX IF NOT EXISTS idx_client_health_specialists_hp ON public.client_health_specialists(health_policy_id);
CREATE INDEX IF NOT EXISTS idx_client_health_medications_hp ON public.client_health_medications(health_policy_id);

-- Enable RLS
ALTER TABLE public.client_health_doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_health_hospitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_health_urgent_cares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_health_pharmacies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_health_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_health_specialists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_health_medications ENABLE ROW LEVEL SECURITY;

-- Helper RLS macro block
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'client_health_doctors',
    'client_health_hospitals',
    'client_health_urgent_cares',
    'client_health_pharmacies',
    'client_health_conditions',
    'client_health_specialists',
    'client_health_medications'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('
      DROP POLICY IF EXISTS %I ON public.%I;
      CREATE POLICY %I ON public.%I FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = client_id AND c.agent_id = auth.uid()
        )
      ) WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = client_id AND c.agent_id = auth.uid()
        )
      );
    ', tbl || '_policy', tbl, tbl || '_policy', tbl);
  END LOOP;
END $$;

-- Automatic Data Migration from existing health_policies text fields
INSERT INTO public.client_health_doctors (health_policy_id, client_id, doctor_name, address, phone)
SELECT hp.id, hp.client_id, trim(hp.primary_doctor), hp.primary_doctor_address, hp.primary_doctor_phone
FROM public.health_policies hp
WHERE hp.primary_doctor IS NOT NULL AND trim(hp.primary_doctor) <> ''
ON CONFLICT DO NOTHING;

INSERT INTO public.client_health_hospitals (health_policy_id, client_id, hospital_name)
SELECT hp.id, hp.client_id, trim(hp.hospital)
FROM public.health_policies hp
WHERE hp.hospital IS NOT NULL AND trim(hp.hospital) <> ''
ON CONFLICT DO NOTHING;

INSERT INTO public.client_health_urgent_cares (health_policy_id, client_id, urgent_care_name)
SELECT hp.id, hp.client_id, trim(hp.urgent_care)
FROM public.health_policies hp
WHERE hp.urgent_care IS NOT NULL AND trim(hp.urgent_care) <> ''
ON CONFLICT DO NOTHING;

INSERT INTO public.client_health_pharmacies (health_policy_id, client_id, pharmacy_name)
SELECT hp.id, hp.client_id, trim(hp.pharmacy)
FROM public.health_policies hp
WHERE hp.pharmacy IS NOT NULL AND trim(hp.pharmacy) <> ''
ON CONFLICT DO NOTHING;

INSERT INTO public.client_health_conditions (health_policy_id, client_id, condition_name)
SELECT hp.id, hp.client_id, trim(hp.conditions)
FROM public.health_policies hp
WHERE hp.conditions IS NOT NULL AND trim(hp.conditions) <> ''
ON CONFLICT DO NOTHING;

INSERT INTO public.client_health_specialists (health_policy_id, client_id, specialist_name)
SELECT hp.id, hp.client_id, trim(hp.specialist)
FROM public.health_policies hp
WHERE hp.specialist IS NOT NULL AND trim(hp.specialist) <> ''
ON CONFLICT DO NOTHING;

INSERT INTO public.client_health_medications (health_policy_id, client_id, medication_name)
SELECT hp.id, hp.client_id, trim(hp.medicines)
FROM public.health_policies hp
WHERE hp.medicines IS NOT NULL AND trim(hp.medicines) <> ''
ON CONFLICT DO NOTHING;
