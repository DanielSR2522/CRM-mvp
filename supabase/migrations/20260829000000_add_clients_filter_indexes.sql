-- SmarTrack CRM — Add indexes for fast server-side filtering & bulk ops
CREATE INDEX IF NOT EXISTS idx_clients_agent_id ON public.clients(agent_id);
CREATE INDEX IF NOT EXISTS idx_clients_created_at ON public.clients(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clients_updated_at ON public.clients(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_policies_client_id_status ON public.policies(client_id, status);
CREATE INDEX IF NOT EXISTS idx_health_policies_client_id_active ON public.health_policies(client_id, active);
