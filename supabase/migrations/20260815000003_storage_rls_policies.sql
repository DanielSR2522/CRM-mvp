-- =====================================================================================
-- SmarTrack CRM — Storage Objects RLS Policies for crm-documents
-- File: supabase/migrations/20260815000003_storage_rls_policies.sql
-- =====================================================================================

-- Allow authenticated users to upload files to crm-documents
DROP POLICY IF EXISTS "Authenticated users upload crm-documents" ON storage.objects;
CREATE POLICY "Authenticated users upload crm-documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'crm-documents');

-- Allow authenticated users to read files in crm-documents
DROP POLICY IF EXISTS "Authenticated users select crm-documents" ON storage.objects;
CREATE POLICY "Authenticated users select crm-documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'crm-documents');

-- Allow authenticated users to delete files in crm-documents
DROP POLICY IF EXISTS "Authenticated users delete crm-documents" ON storage.objects;
CREATE POLICY "Authenticated users delete crm-documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'crm-documents');

-- Allow authenticated users to update files in crm-documents
DROP POLICY IF EXISTS "Authenticated users update crm-documents" ON storage.objects;
CREATE POLICY "Authenticated users update crm-documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'crm-documents');
