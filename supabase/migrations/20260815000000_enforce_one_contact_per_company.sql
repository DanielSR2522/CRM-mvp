-- Enforce uniqueness of company_client_id so each Company client has at most ONE linked Personal client
CREATE UNIQUE INDEX IF NOT EXISTS client_company_relationships_one_person_per_company
ON public.client_company_relationships(company_client_id);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
