-- SmarTrack CRM — Add health_policy_id foreign key to public.client_documents
ALTER TABLE public.client_documents
ADD COLUMN IF NOT EXISTS health_policy_id UUID NULL REFERENCES public.health_policies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_client_documents_health_policy_id ON public.client_documents(health_policy_id);
