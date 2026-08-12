-- =====================================================================================
-- Migration: 20260821000000_add_module_type_and_policy_id_to_client_documents.sql
-- Description: Additive migration adding module_type and policy_id columns to client_documents.
-- =====================================================================================

ALTER TABLE public.client_documents
  ADD COLUMN IF NOT EXISTS module_type TEXT DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS policy_id UUID DEFAULT NULL;

CREATE INDEX IF NOT EXISTS client_documents_module_type_idx ON public.client_documents(module_type);
CREATE INDEX IF NOT EXISTS client_documents_policy_id_idx ON public.client_documents(policy_id);

NOTIFY pgrst, 'reload schema';
