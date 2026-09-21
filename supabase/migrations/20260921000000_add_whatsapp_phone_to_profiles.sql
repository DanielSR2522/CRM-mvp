-- Migration: Add whatsapp_phone to public.profiles with unique partial index for non-null values
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp_phone text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_whatsapp_phone_idx
  ON public.profiles (whatsapp_phone)
  WHERE whatsapp_phone IS NOT NULL;
