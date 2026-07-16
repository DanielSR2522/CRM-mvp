-- Migration to add policy summary columns
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS broker_name TEXT;
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS writing_company TEXT;
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS total_premium NUMERIC DEFAULT 0;
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS annual_premium NUMERIC DEFAULT 0;
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS policy_payment_frequency TEXT;
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS billing_type TEXT;

-- Create index only if it does not already exist
CREATE INDEX IF NOT EXISTS policies_status_idx
ON public.policies(status);
