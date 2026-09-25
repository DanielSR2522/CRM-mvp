-- Migration: Add preferred_language column to client_personal_information
ALTER TABLE public.client_personal_information
ADD COLUMN IF NOT EXISTS preferred_language text NULL;
