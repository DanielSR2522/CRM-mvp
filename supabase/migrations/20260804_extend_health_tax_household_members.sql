-- Migration: Add gender, us_citizen, uses_tobacco, annual_income, income_type, employer_name, employer_phone to health_tax_household_members
ALTER TABLE public.health_tax_household_members
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS us_citizen BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS uses_tobacco BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS annual_income NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS income_type TEXT,
  ADD COLUMN IF NOT EXISTS employer_name TEXT,
  ADD COLUMN IF NOT EXISTS employer_phone TEXT;
