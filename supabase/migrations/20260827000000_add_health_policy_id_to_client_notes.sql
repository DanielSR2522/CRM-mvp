-- SmarTrack CRM — Add health_policy_id foreign key to public.client_notes
ALTER TABLE public.client_notes
ADD COLUMN IF NOT EXISTS health_policy_id UUID NULL REFERENCES public.health_policies(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_client_notes_health_policy_id ON public.client_notes(health_policy_id);
