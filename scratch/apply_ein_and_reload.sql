ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS ein TEXT;

NOTIFY pgrst, 'reload schema';
