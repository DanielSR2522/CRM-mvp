-- 1. Create client_personal_information table
CREATE TABLE IF NOT EXISTS public.client_personal_information (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
    full_name TEXT,
    date_of_birth DATE,
    ssn TEXT,
    email TEXT,
    phone TEXT,
    tax_members INTEGER,
    gender TEXT,
    marital_status TEXT,
    born_in_usa BOOLEAN,
    immigration_status TEXT,
    alien_number TEXT,
    card_number TEXT,
    uscis_number TEXT,
    immigration_category TEXT,
    immigration_expiration_date DATE,
    immigration_other_description TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS on client_personal_information
ALTER TABLE public.client_personal_information ENABLE ROW LEVEL SECURITY;

-- Create policy for client_personal_information (agent ownership check via clients table)
CREATE POLICY "Agents can manage personal info of their clients"
ON public.client_personal_information
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = client_personal_information.client_id
        AND c.agent_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = client_personal_information.client_id
        AND c.agent_id = auth.uid()
    )
);

-- 2. Create client_residence_information table
CREATE TABLE IF NOT EXISTS public.client_residence_information (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
    address TEXT,
    city TEXT,
    zip_code TEXT,
    county TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS on client_residence_information
ALTER TABLE public.client_residence_information ENABLE ROW LEVEL SECURITY;

-- Create policy for client_residence_information (agent ownership check via clients table)
CREATE POLICY "Agents can manage residence info of their clients"
ON public.client_residence_information
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = client_residence_information.client_id
        AND c.agent_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = client_residence_information.client_id
        AND c.agent_id = auth.uid()
    )
);

-- 3. Create client_income_information table
CREATE TABLE IF NOT EXISTS public.client_income_information (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    relationship_to_applicant TEXT,
    income_type TEXT,
    employer_name TEXT,
    employer_phone TEXT,
    income NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS on client_income_information
ALTER TABLE public.client_income_information ENABLE ROW LEVEL SECURITY;

-- Create policy for client_income_information (agent ownership check via clients table)
CREATE POLICY "Agents can manage income info of their clients"
ON public.client_income_information
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = client_income_information.client_id
        AND c.agent_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = client_income_information.client_id
        AND c.agent_id = auth.uid()
    )
);

-- 4. Add performance indexes on client_id columns
CREATE INDEX IF NOT EXISTS client_personal_info_client_id_idx ON public.client_personal_information(client_id);
CREATE INDEX IF NOT EXISTS client_residence_info_client_id_idx ON public.client_residence_information(client_id);
CREATE INDEX IF NOT EXISTS client_income_info_client_id_idx ON public.client_income_information(client_id);
