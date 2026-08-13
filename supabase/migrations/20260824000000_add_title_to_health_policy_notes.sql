-- Migration: Add optional title column to health_policy_notes
-- Timestamp: 20260824000000_add_title_to_health_policy_notes.sql

ALTER TABLE public.health_policy_notes
ADD COLUMN IF NOT EXISTS title TEXT;
