-- Migration: Create client_links table for saved client links
-- Timestamp: 20260824000001_create_client_links_table.sql

CREATE TABLE IF NOT EXISTS public.client_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_links_client_id ON public.client_links(client_id);

ALTER TABLE public.client_links ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'client_links' AND policyname = 'client_links_policy'
  ) THEN
    CREATE POLICY "client_links_policy" ON public.client_links FOR ALL USING (
      EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = client_id AND c.agent_id = auth.uid()
      )
    ) WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = client_id AND c.agent_id = auth.uid()
      )
    );
  END IF;
END $$;
