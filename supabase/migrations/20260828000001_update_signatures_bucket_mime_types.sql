-- =====================================================================================
-- SmarTrack CRM — Update Signatures Bucket Allowed MIME Types & Size Limit
-- File: supabase/migrations/20260828000000_update_signatures_bucket_mime_types.sql
-- =====================================================================================

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp'],
    file_size_limit = 5242880
WHERE id = 'signatures';
