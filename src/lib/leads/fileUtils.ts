import { supabase } from '@/lib/supabaseClient';

export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

export const ALLOWED_EXTENSIONS = [
  'pdf', 'doc', 'docx', 'xls', 'xlsx',
  'png', 'jpg', 'jpeg', 'webp', 'txt'
];

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain'
];

/**
 * Validates a file before upload. Returns null if valid, or an error string if invalid.
 * Rejects zero-byte files, files exceeding 15 MB, and unsupported formats.
 */
export function validateLeadFile(file: File): string | null {
  if (!file || file.size === 0) {
    return 'Cannot upload an empty (0-byte) file.';
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `File size exceeds the 15 MB limit (${formatBytes(file.size)}).`;
  }

  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const isAllowedExt = ALLOWED_EXTENSIONS.includes(extension);
  const isAllowedMime = ALLOWED_MIME_TYPES.includes(file.type);

  if (!isAllowedExt && !isAllowedMime) {
    return `Unsupported file format (.${extension}). Allowed formats: PDF, DOC, DOCX, XLS, XLSX, PNG, JPG, JPEG, WEBP, TXT.`;
  }

  return null;
}

/**
 * Formats byte size into human readable string (KB, MB).
 */
export function formatBytes(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Creates a temporary signed download URL for private files stored in Supabase Storage.
 */
export async function getLeadFileSignedUrl(storagePath: string, expiresInSeconds: number = 3600): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .storage
      .from('lead-files')
      .createSignedUrl(storagePath, expiresInSeconds);

    if (error) throw error;
    return data?.signedUrl || null;
  } catch (err: any) {
    console.error('Error generating signed URL:', err);
    return null;
  }
}

/**
 * Helper to log timeline events via secure RPC `log_lead_timeline_event`.
 * Title is derived server-side from eventType for security.
 */
export async function logTimelineEvent(
  leadId: string,
  eventType: string,
  description?: string,
  metadata: Record<string, any> = {}
) {
  try {
    const { error } = await supabase.rpc('log_lead_timeline_event', {
      p_lead_id: leadId,
      p_event_type: eventType,
      p_description: description || null,
      p_metadata: metadata,
    });
    if (error) throw error;
  } catch (err: any) {
    console.error('Error logging timeline event:', err);
    // Non-fatal logging failure
  }
}
