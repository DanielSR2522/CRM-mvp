-- SmarTrack CRM — Add Cargo column to public.policies
ALTER TABLE public.policies
ADD COLUMN IF NOT EXISTS cargo TEXT;
