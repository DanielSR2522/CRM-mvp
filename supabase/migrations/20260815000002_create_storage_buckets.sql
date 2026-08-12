-- =====================================================================================
-- SmarTrack CRM — Supabase Storage Buckets Configuration
-- File: supabase/migrations/20260815000002_create_storage_buckets.sql
-- =====================================================================================

-- CREATE PRIVATE STORAGE BUCKETS
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('crm-documents', 'crm-documents', false, 52428800, NULL)
ON CONFLICT (id) DO UPDATE SET public = false;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('policy-documents', 'policy-documents', false, 52428800, NULL)
ON CONFLICT (id) DO UPDATE SET public = false;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('health-policy-documents', 'health-policy-documents', false, 52428800, NULL)
ON CONFLICT (id) DO UPDATE SET public = false;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('lead-files', 'lead-files', false, 52428800, NULL)
ON CONFLICT (id) DO UPDATE SET public = false;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('signed-documents', 'signed-documents', false, 52428800, NULL)
ON CONFLICT (id) DO UPDATE SET public = false;
