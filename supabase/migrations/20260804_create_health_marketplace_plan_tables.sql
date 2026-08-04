-- Migration: Create health_marketplace_plan_snapshots and health_marketplace_plan_benefits
CREATE TABLE IF NOT EXISTS public.health_marketplace_plan_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  health_policy_id UUID REFERENCES public.health_policies(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL,
  coverage_year INTEGER NOT NULL,
  issuer_name TEXT,
  plan_name TEXT,
  metal_level TEXT,
  plan_type TEXT,
  network_type TEXT,
  premium_full NUMERIC(10,2),
  tax_credit NUMERIC(10,2),
  premium_net NUMERIC(10,2),
  premium_annual NUMERIC(10,2),
  deductible_individual NUMERIC(10,2),
  deductible_family NUMERIC(10,2),
  drug_deductible_individual NUMERIC(10,2),
  drug_deductible_family NUMERIC(10,2),
  oop_max_individual NUMERIC(10,2),
  oop_max_family NUMERIC(10,2),
  raw_response JSONB,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.health_marketplace_plan_benefits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID REFERENCES public.health_marketplace_plan_snapshots(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  service_name TEXT NOT NULL,
  copay_amount NUMERIC(10,2),
  coinsurance_percentage NUMERIC(5,2),
  deductible_applies BOOLEAN DEFAULT false,
  coverage_status TEXT,
  individual_value TEXT,
  family_value TEXT,
  limitations TEXT,
  notes TEXT,
  source_text TEXT,
  source_url TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.health_marketplace_plan_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_marketplace_plan_benefits ENABLE ROW LEVEL SECURITY;

-- Policies for health_marketplace_plan_snapshots
DROP POLICY IF EXISTS "Authenticated users can select health marketplace plan snapshots" ON public.health_marketplace_plan_snapshots;
CREATE POLICY "Authenticated users can select health marketplace plan snapshots"
  ON public.health_marketplace_plan_snapshots FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert health marketplace plan snapshots" ON public.health_marketplace_plan_snapshots;
CREATE POLICY "Authenticated users can insert health marketplace plan snapshots"
  ON public.health_marketplace_plan_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update health marketplace plan snapshots" ON public.health_marketplace_plan_snapshots;
CREATE POLICY "Authenticated users can update health marketplace plan snapshots"
  ON public.health_marketplace_plan_snapshots FOR UPDATE
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete health marketplace plan snapshots" ON public.health_marketplace_plan_snapshots;
CREATE POLICY "Authenticated users can delete health marketplace plan snapshots"
  ON public.health_marketplace_plan_snapshots FOR DELETE
  TO authenticated
  USING (true);

-- Policies for health_marketplace_plan_benefits
DROP POLICY IF EXISTS "Authenticated users can select health marketplace plan benefits" ON public.health_marketplace_plan_benefits;
CREATE POLICY "Authenticated users can select health marketplace plan benefits"
  ON public.health_marketplace_plan_benefits FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert health marketplace plan benefits" ON public.health_marketplace_plan_benefits;
CREATE POLICY "Authenticated users can insert health marketplace plan benefits"
  ON public.health_marketplace_plan_benefits FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update health marketplace plan benefits" ON public.health_marketplace_plan_benefits;
CREATE POLICY "Authenticated users can update health marketplace plan benefits"
  ON public.health_marketplace_plan_benefits FOR UPDATE
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete health marketplace plan benefits" ON public.health_marketplace_plan_benefits;
CREATE POLICY "Authenticated users can delete health marketplace plan benefits"
  ON public.health_marketplace_plan_benefits FOR DELETE
  TO authenticated
  USING (true);
