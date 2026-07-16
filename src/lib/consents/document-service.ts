/**
 * Signed documents — the agent's side.
 *
 * Downloads and retries, all through the authenticated browser client and RLS.
 * No service role here: an agent reaching their own client's document is exactly
 * what the storage policy already allows, and routing it through a server would
 * add a bypass for no benefit.
 */

import { supabase } from '@/lib/supabaseClient';
import type { SignatureRequest } from './types';
import { describeSupabaseError } from './template-service';
import { getConsent } from './request-service';

class DocumentServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentServiceError';
  }
}

/** Long enough to click, short enough that a leaked URL is worthless tomorrow. */
const SIGNED_URL_SECONDS = 60;

export interface SignatureFileRow {
  id: string;
  request_id: string;
  file_type: 'signature_image' | 'original_snapshot' | 'signed_document' | 'audit_certificate';
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number | null;
  sha256_hash: string;
  created_at: string;
}

export async function listConsentFiles(requestId: string): Promise<SignatureFileRow[]> {
  const { data, error } = await supabase
    .from('signature_files')
    .select('*')
    .eq('request_id', requestId)
    .order('created_at', { ascending: true });

  if (error) throw new DocumentServiceError(describeSupabaseError(error));
  return (data ?? []) as SignatureFileRow[];
}

/**
 * A temporary URL for one stored file.
 *
 * The bucket is private and stays private. Every download mints a fresh URL that
 * dies in a minute, so a link pasted into a chat is useless by the time anyone
 * else reads it.
 */
export async function signedUrlFor(file: SignatureFileRow): Promise<string> {
  const { data, error } = await supabase.storage
    .from(file.storage_bucket)
    .createSignedUrl(file.storage_path, SIGNED_URL_SECONDS);

  if (error || !data?.signedUrl) {
    throw new DocumentServiceError(
      error ? describeSupabaseError(error) : 'Could not create a download link.'
    );
  }
  return data.signedUrl;
}

/** Records the download before handing over the URL, so the trail is honest. */
async function recordDownload(requestId: string, fileType: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  await supabase.from('signature_events').insert({
    request_id: requestId,
    performed_by: userData?.user?.id ?? null,
    event_type: 'document_downloaded',
    metadata: { file_type: fileType },
  });
}

/**
 * The signed PDF.
 *
 * Explains *why* it is unavailable rather than just failing: "still generating"
 * and "generation failed, retry" need completely different reactions from the
 * agent, and a single "not available" would leave them guessing.
 */
export async function downloadSignedDocument(requestId: string): Promise<string> {
  const request = await getConsent(requestId);

  if (request.status !== 'signed') {
    throw new DocumentServiceError('This consent has not been signed yet.');
  }

  if (request.final_document_status === 'failed') {
    throw new DocumentServiceError(
      `The signed PDF could not be generated${
        request.final_document_error ? `: ${request.final_document_error}` : ''
      }. The signature itself is safe — use Retry to build the PDF again.`
    );
  }
  if (request.final_document_status !== 'generated') {
    throw new DocumentServiceError('The signed PDF is still being generated. Try again in a moment.');
  }

  const files = await listConsentFiles(requestId);
  const signed = files.find((f) => f.file_type === 'signed_document');
  if (!signed) {
    throw new DocumentServiceError('The signed PDF is registered but its file is missing.');
  }

  const url = await signedUrlFor(signed);
  await recordDownload(requestId, 'signed_document');
  return url;
}

export async function downloadAuditCertificate(requestId: string): Promise<string> {
  const files = await listConsentFiles(requestId);
  const certificate = files.find((f) => f.file_type === 'audit_certificate');
  if (!certificate) {
    throw new DocumentServiceError('No audit certificate exists for this consent yet.');
  }

  const url = await signedUrlFor(certificate);
  await recordDownload(requestId, 'audit_certificate');
  return url;
}

/**
 * Retries a failed PDF build.
 *
 * Goes through the server route because generation needs the service role. The
 * access token is passed as a bearer so the route can verify who is asking and
 * confirm they own the consent — the service role does not do that for us.
 */
export async function retryDocumentGeneration(requestId: string): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;

  if (!accessToken) {
    throw new DocumentServiceError('Your session has expired. Sign in again.');
  }

  const response = await fetch(`/api/signature-requests/${requestId}/regenerate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new DocumentServiceError(body.error ?? 'The document could not be generated.');
  }
}

/** True when the PDF failed and the agent can do something about it. */
export function canRetryGeneration(request: Pick<SignatureRequest, 'status' | 'final_document_status'>): boolean {
  return request.status === 'signed' && request.final_document_status === 'failed';
}

export { DocumentServiceError };
