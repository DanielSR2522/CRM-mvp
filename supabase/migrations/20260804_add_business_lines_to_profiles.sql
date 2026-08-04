-- =============================================
-- Migration: Add business_lines to profiles
-- Timestamp: 20260804_add_business_lines_to_profiles.sql
-- =============================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS business_lines TEXT[] NOT NULL DEFAULT ARRAY['health', 'life', 'property_casualty', 'supplemental']::TEXT[];
