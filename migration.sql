-- 1. Create clients table
CREATE TABLE IF NOT EXISTS public.clients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    agent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    agency_name TEXT,
    address TEXT,
    email TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS on clients
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Create policy for clients (agent ownership restriction)
CREATE POLICY "Agents can manage their own clients"
ON public.clients
FOR ALL
USING (agent_id = auth.uid())
WITH CHECK (agent_id = auth.uid());

-- 2. Create policies table
CREATE TABLE IF NOT EXISTS public.policies (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    policy_type TEXT NOT NULL,
    policy_subtype TEXT,
    policy_number TEXT,
    company_name TEXT,
    premium NUMERIC NOT NULL DEFAULT 0,
    effective_date DATE,
    expiration_date DATE,
    transaction_type TEXT CHECK (transaction_type IN ('New', 'Renewal', 'Endorsement')),
    business_type TEXT CHECK (business_type IN ('Personal', 'Commercial')),
    status TEXT CHECK (status IN ('Active', 'Cancelled', 'Expired')),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS on policies
ALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;

-- Create policy for policies (nested agent ownership verification)
CREATE POLICY "Agents can manage policies of their clients"
ON public.policies
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = policies.client_id
        AND c.agent_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = policies.client_id
        AND c.agent_id = auth.uid()
    )
);

-- 3. Create performance indexes
CREATE INDEX IF NOT EXISTS clients_agent_id_idx ON public.clients(agent_id);
CREATE INDEX IF NOT EXISTS policies_client_id_idx ON public.policies(client_id);
