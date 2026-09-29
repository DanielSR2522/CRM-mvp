-- Migration: Normalize Life Product Types and Add product_name Field
-- Project: walgdtoolzpdhgxzejph (main)

-- 1. Add product_name column to public.life_policy_products if it does not exist
ALTER TABLE public.life_policy_products 
ADD COLUMN IF NOT EXISTS product_name TEXT NULL;

-- 2. Drop all existing check constraints on public.life_policy_products
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.life_policy_products'::regclass
          AND contype = 'c'
    ) LOOP
        EXECUTE 'ALTER TABLE public.life_policy_products DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    END LOOP;
END $$;

-- 3. Update legacy product_type values to normalized taxonomy
UPDATE public.life_policy_products
SET product_type = CASE
  WHEN product_type = 'Term' THEN 'Term Life'
  WHEN product_type = 'IUL' THEN 'Universal Life'
  WHEN product_type = 'Whole Life' THEN 'Whole Life'
  WHEN product_type = 'VUL' THEN 'Variable Universal Life Insurance'
  WHEN product_type = 'Term - Disability' THEN 'Term Life'
  WHEN product_type = 'Costumer Whole Life' THEN 'Whole Life'
  ELSE product_type
END
WHERE product_type IN ('Term', 'IUL', 'VUL', 'Term - Disability', 'Costumer Whole Life');

-- 4. Add updated check constraint with exact 9 canonical Product Types
ALTER TABLE public.life_policy_products
ADD CONSTRAINT life_policy_products_product_type_check
CHECK (product_type IN (
  'Asset Preserver',
  'Income Annuity',
  'Term Life',
  'Transfer on Death / Individual',
  'Universal Life',
  'Variable Annuity',
  'Variable Life',
  'Variable Universal Life Insurance',
  'Whole Life'
));
