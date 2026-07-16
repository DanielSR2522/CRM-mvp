-- Create policy_notes table if not exists
CREATE TABLE IF NOT EXISTS public.policy_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id UUID NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES auth.users(id),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on policy_notes
ALTER TABLE public.policy_notes ENABLE ROW LEVEL SECURITY;

-- Indexes for policy_notes
CREATE INDEX IF NOT EXISTS policy_notes_policy_id_idx ON public.policy_notes(policy_id);
CREATE INDEX IF NOT EXISTS policy_notes_created_at_idx ON public.policy_notes(created_at);

-- RLS policies for policy_notes (nested client agent restrictions)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'policy_notes' AND policyname = 'Agents can select notes of their policies'
    ) THEN
        CREATE POLICY "Agents can select notes of their policies" ON public.policy_notes
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM public.policies p 
                JOIN public.clients c ON p.client_id = c.id 
                WHERE p.id = policy_notes.policy_id AND c.agent_id = auth.uid()
            )
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'policy_notes' AND policyname = 'Agents can insert notes for their policies'
    ) THEN
        CREATE POLICY "Agents can insert notes for their policies" ON public.policy_notes
        FOR INSERT WITH CHECK (
            author_id = auth.uid() AND 
            EXISTS (
                SELECT 1 FROM public.policies p 
                JOIN public.clients c ON p.client_id = c.id 
                WHERE p.id = policy_notes.policy_id AND c.agent_id = auth.uid()
            )
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'policy_notes' AND policyname = 'Agents can update notes they authored'
    ) THEN
        CREATE POLICY "Agents can update notes they authored" ON public.policy_notes
        FOR UPDATE USING (
            author_id = auth.uid() AND 
            EXISTS (
                SELECT 1 FROM public.policies p 
                JOIN public.clients c ON p.client_id = c.id 
                WHERE p.id = policy_notes.policy_id AND c.agent_id = auth.uid()
            )
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'policy_notes' AND policyname = 'Agents can delete notes they authored'
    ) THEN
        CREATE POLICY "Agents can delete notes they authored" ON public.policy_notes
        FOR DELETE USING (
            author_id = auth.uid() AND 
            EXISTS (
                SELECT 1 FROM public.policies p 
                JOIN public.clients c ON p.client_id = c.id 
                WHERE p.id = policy_notes.policy_id AND c.agent_id = auth.uid()
            )
        );
    END IF;
END $$;

-- Create activity_events table if not exists
CREATE TABLE IF NOT EXISTS public.activity_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    policy_id UUID NULL REFERENCES public.policies(id) ON DELETE SET NULL, -- SET NULL constraint to retain event history
    actor_id UUID NOT NULL REFERENCES auth.users(id),
    event_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on activity_events
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

-- Indexes for activity_events
CREATE INDEX IF NOT EXISTS activity_events_client_id_idx ON public.activity_events(client_id);
CREATE INDEX IF NOT EXISTS activity_events_policy_id_idx ON public.activity_events(policy_id);
CREATE INDEX IF NOT EXISTS activity_events_created_at_idx ON public.activity_events(created_at);

-- RLS policies for activity_events (read-only for agent client scope, insert validation)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'activity_events' AND policyname = 'Agents can select events of their clients'
    ) THEN
        CREATE POLICY "Agents can select events of their clients" ON public.activity_events
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM public.clients c 
                WHERE c.id = activity_events.client_id AND c.agent_id = auth.uid()
            )
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'activity_events' AND policyname = 'Agents can insert events for their clients'
    ) THEN
        CREATE POLICY "Agents can insert events for their clients" ON public.activity_events
        FOR INSERT WITH CHECK (
            actor_id = auth.uid() AND 
            EXISTS (
                SELECT 1 FROM public.clients c 
                WHERE c.id = activity_events.client_id AND c.agent_id = auth.uid()
            ) AND (
                policy_id IS NULL OR 
                EXISTS (
                    SELECT 1 FROM public.policies p 
                    WHERE p.id = policy_id AND p.client_id = client_id
                )
            )
        );
    END IF;
END $$;
