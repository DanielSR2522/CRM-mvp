/**
 * Final document generation — server only.
 *
 * Runs after a signature lands. Builds the signed PDF and the audit certificate,
 * stores both in the private bucket, registers them, files the PDF under the
 * policy's Documents when there is a policy, and writes the Chronology entries.
 *
 * THE RULE THAT SHAPES ALL OF THIS
 *   A failure here must never cost the signature. The client has already signed;
 *   asking them to do it again because our PDF writer had a bad day would be
 *   both absurd and, for a consent document, legally dubious. So generation is
 *   strictly downstream: it reads evidence, it never touches it, and every
 *   failure mode ends with final_document_status = 'failed' and a retry.
 */

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import type { MergeDataSnapshot, SignatureRequest, SignatureRequestSigner } from '@/lib/consents/types';
import { buildAuditCertificate, buildSignedPdf, type AuditEventRow } from './pdf-generator';

export interface GenerationResult {
  ok: boolean;
  signedPath?: string;
  certificatePath?: string;
  finalHash?: string;
  error?: string;
}

/** Never let a raw driver message reach a public response. */
function safeError(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 300);
  return 'Unknown error during document generation.';
}

/**
 * Generates and files everything. Safe to call twice.
 *
 * Idempotent by short-circuit: if the request already has a generated document,
 * it returns it rather than building a second one. "Do not silently regenerate a
 * signed document" is a hard rule — a second PDF would have a different hash and
 * there would be no way to say which one the client signed.
 */
export async function generateFinalDocuments(requestId: string): Promise<GenerationResult> {
  const admin = getSupabaseAdmin();

  try {
    // ---- Load, and refuse to redo work ---------------------------------
    const { data: requestRow, error: requestError } = await admin
      .from('signature_requests')
      .select('*, clients(id, agent_id, full_name, agency_name)')
      .eq('id', requestId)
      .maybeSingle();

    if (requestError || !requestRow) {
      return { ok: false, error: 'Request not found.' };
    }

    const request = requestRow as unknown as SignatureRequest;
    const client = (requestRow as Record<string, unknown>).clients as {
      id: string;
      agent_id: string;
      full_name: string;
      agency_name: string | null;
    } | null;

    if (!client) return { ok: false, error: 'Client not found.' };

    if (request.final_document_status === 'generated' && request.final_file_path) {
      return {
        ok: true,
        signedPath: request.final_file_path,
        finalHash: request.final_document_hash ?? undefined,
      };
    }
    if (request.status !== 'signed') {
      return { ok: false, error: 'This consent is not signed, so there is nothing to generate.' };
    }

    await admin
      .from('signature_requests')
      .update({ final_document_status: 'generating', final_document_error: null })
      .eq('id', requestId);

    const { data: signerRow } = await admin
      .from('signature_request_signers')
      .select('*')
      .eq('request_id', requestId)
      .order('signer_order', { ascending: true })
      .limit(1)
      .maybeSingle();

    const signer = signerRow as SignatureRequestSigner | null;
    if (!signer?.signed_at) {
      return await fail(requestId, 'No signed signer found for this consent.');
    }

    // ---- The drawn signature, if any ------------------------------------
    let signatureImage: Uint8Array | null = null;
    if (signer.signature_method === 'draw' && signer.signature_image_path) {
      const { data: blob, error: downloadError } = await admin.storage
        .from('signatures')
        .download(signer.signature_image_path);

      if (downloadError || !blob) {
        return await fail(requestId, `Could not read the signature image: ${downloadError?.message ?? 'missing'}`);
      }
      signatureImage = new Uint8Array(await blob.arrayBuffer());
    }

    const snapshot = request.merge_data_snapshot as MergeDataSnapshot | null;
    const consentText = signer.consent_text_snapshot ?? snapshot?.rendered_consent_text ?? '';
    const signedAt = new Date(signer.signed_at);

    // ---- Build ----------------------------------------------------------
    // rendered_content, not a fresh merge: this is the document the client read.
    const signedPdf = await buildSignedPdf({
      title: request.title,
      agencyName: client.agency_name,
      clientName: client.full_name,
      content: request.rendered_content,
      consentText,
      signerName: signer.full_name,
      signatureMethod: (signer.signature_method as 'draw' | 'typed') ?? 'typed',
      signatureImage,
      typedSignature: signer.typed_signature,
      signedAt,
      documentHash: request.original_document_hash ?? '(not recorded)',
    });

    const { data: events } = await admin
      .from('signature_events')
      .select('event_type, created_at, ip_address, user_agent, channel')
      .eq('request_id', requestId)
      .order('created_at', { ascending: true });

    const certificate = await buildAuditCertificate({
      title: request.title,
      agencyName: client.agency_name,
      clientName: client.full_name,
      signerName: signer.full_name,
      signerEmail: signer.email,
      signerPhone: signer.phone,
      requestId,
      signerId: signer.id,
      documentHash: request.original_document_hash ?? '(not recorded)',
      signedPdfHash: signedPdf.sha256,
      signatureMethod: (signer.signature_method as 'draw' | 'typed') ?? 'typed',
      consentText,
      consentAcceptedAt: signer.consent_accepted_at ? new Date(signer.consent_accepted_at) : null,
      signedAt,
      events: (events ?? []) as AuditEventRow[],
    });

    // ---- Store ----------------------------------------------------------
    // First path segment is the agent uid, matching the storage RLS rule.
    const base = `${client.agent_id}/${client.id}/${requestId}`;
    const signedPath = `${base}/signed-document.pdf`;
    const certificatePath = `${base}/audit-certificate.pdf`;

    const upload = async (path: string, bytes: Uint8Array) =>
      admin.storage.from('signed-documents').upload(path, bytes, {
        contentType: 'application/pdf',
        // upsert so a retry after a partial failure overwrites its own leftovers
        // rather than colliding with them.
        upsert: true,
      });

    const { error: signedUploadError } = await upload(signedPath, signedPdf.bytes);
    if (signedUploadError) {
      return await fail(requestId, `Signed PDF upload failed: ${signedUploadError.message}`);
    }

    const { error: certUploadError } = await upload(certificatePath, certificate.bytes);
    if (certUploadError) {
      return await fail(requestId, `Audit certificate upload failed: ${certUploadError.message}`);
    }

    // ---- Register --------------------------------------------------------
    // storage_path is UNIQUE, so a retry would collide. Clear our own rows first.
    await admin
      .from('signature_files')
      .delete()
      .eq('request_id', requestId)
      .in('file_type', ['signed_document', 'audit_certificate']);

    const { error: filesError } = await admin.from('signature_files').insert([
      {
        request_id: requestId,
        signer_id: signer.id,
        file_type: 'signed_document',
        storage_bucket: 'signed-documents',
        storage_path: signedPath,
        mime_type: 'application/pdf',
        size_bytes: signedPdf.bytes.length,
        sha256_hash: signedPdf.sha256,
      },
      {
        request_id: requestId,
        signer_id: signer.id,
        file_type: 'audit_certificate',
        storage_bucket: 'signed-documents',
        storage_path: certificatePath,
        mime_type: 'application/pdf',
        size_bytes: certificate.bytes.length,
        sha256_hash: certificate.sha256,
      },
    ]);

    if (filesError) {
      return await fail(requestId, `Could not register the files: ${filesError.message}`);
    }

    const { error: finalError } = await admin
      .from('signature_requests')
      .update({
        final_file_path: signedPath,
        final_document_hash: signedPdf.sha256,
        final_document_status: 'generated',
        final_document_error: null,
      })
      .eq('id', requestId);

    if (finalError) {
      return await fail(requestId, `Could not finalise the request: ${finalError.message}`);
    }

    await admin.from('signature_events').insert({
      request_id: requestId,
      signer_id: signer.id,
      performed_by: null,
      event_type: 'final_document_generated',
      metadata: {
        signed_pdf_sha256: signedPdf.sha256,
        certificate_sha256: certificate.sha256,
        size_bytes: signedPdf.bytes.length,
      },
    });

    // ---- File it where the agency will look for it -----------------------
    // Both are best-effort: the document exists and is downloadable from the
    // Consents module regardless. A failure to cross-file is an inconvenience,
    // not a reason to mark a perfectly good PDF as failed.
    await linkToPolicyDocuments(requestId, request, client, signedPath, signedPdf.bytes.length).catch((err) =>
      console.error('Could not file the consent under the policy:', safeError(err))
    );

    await writeChronology(request, client, 'signed_document_generated', 'Signed document generated', {
      request_id: requestId,
    }).catch((err) => console.error('Could not write Chronology:', safeError(err)));

    return { ok: true, signedPath, certificatePath, finalHash: signedPdf.sha256 };
  } catch (err) {
    return await fail(requestId, safeError(err));
  }
}

/**
 * Marks the generation failed and returns the result.
 *
 * The signature and every event stay exactly where they are. Only the PDF is
 * marked for retry, which is the whole point of final_document_status living in
 * its own column rather than in `status`.
 */
async function fail(requestId: string, error: string): Promise<GenerationResult> {
  const admin = getSupabaseAdmin();

  await admin
    .from('signature_requests')
    .update({ final_document_status: 'failed', final_document_error: error.slice(0, 500) })
    .eq('id', requestId);

  await admin.from('signature_events').insert({
    request_id: requestId,
    performed_by: null,
    event_type: 'final_document_failed',
    metadata: { error: error.slice(0, 300) },
  });

  return { ok: false, error };
}

// ---------------------------------------------------------------------------
// Documents integration
// ---------------------------------------------------------------------------

const SIGNED_CONSENTS_SECTION = 'Signed Consents';
const MAX_SECTIONS = 10;

/**
 * Files the signed PDF under the policy's Documents tab.
 *
 * Only when the consent has a policy: policy_documents.policy_id and section_id
 * are both NOT NULL, and inventing a policy to satisfy a foreign key would be
 * fabricating a record. A consent without a policy simply lives in the Consents
 * module, which is where the agent will look for it anyway.
 */
async function linkToPolicyDocuments(
  requestId: string,
  request: SignatureRequest,
  client: { id: string; agent_id: string },
  storagePath: string,
  sizeBytes: number
): Promise<void> {
  if (!request.policy_id) return;

  const admin = getSupabaseAdmin();

  // ---- Find or create the section --------------------------------------
  const { data: existing } = await admin
    .from('policy_document_sections')
    .select('id')
    .eq('policy_id', request.policy_id)
    .eq('name', SIGNED_CONSENTS_SECTION)
    .maybeSingle();

  let sectionId = existing?.id as string | undefined;

  if (!sectionId) {
    // The 10-section limit is enforced by a trigger. Checking first turns a
    // raised exception into a skip with a readable log line.
    const { count } = await admin
      .from('policy_document_sections')
      .select('id', { count: 'exact', head: true })
      .eq('policy_id', request.policy_id);

    if ((count ?? 0) >= MAX_SECTIONS) {
      console.warn(
        `Policy ${request.policy_id} already has ${count} document sections, so "${SIGNED_CONSENTS_SECTION}" could not be created. The signed PDF is still available from Consents & Signatures.`
      );
      return;
    }

    const { data: created, error: sectionError } = await admin
      .from('policy_document_sections')
      .insert({
        policy_id: request.policy_id,
        name: SIGNED_CONSENTS_SECTION,
        position: count ?? 0,
        created_by: request.created_by,
      })
      .select('id')
      .single();

    if (sectionError || !created) {
      // A unique-violation here means a concurrent signature created it first.
      const { data: retry } = await admin
        .from('policy_document_sections')
        .select('id')
        .eq('policy_id', request.policy_id)
        .eq('name', SIGNED_CONSENTS_SECTION)
        .maybeSingle();

      if (!retry) throw new Error(sectionError?.message ?? 'Could not create the section.');
      sectionId = retry.id as string;
    } else {
      sectionId = created.id as string;
    }
  }

  // ---- Register the document, once -------------------------------------
  const { data: alreadyFiled } = await admin
    .from('policy_documents')
    .select('id')
    .eq('storage_path', storagePath)
    .maybeSingle();

  if (alreadyFiled) return; // a retry; nothing to do

  // NOTE: policy_documents rows point at the signed-documents bucket, not at
  // policy-documents. The Documents tab reads storage_path from the
  // policy-documents bucket, so this row is currently a metadata reference the
  // existing UI cannot download. Flagged in the report — filing it correctly
  // needs either a bucket column on policy_documents or a copy of the PDF into
  // policy-documents, and both are decisions for the owner rather than
  // something to guess at.
  const { error } = await admin.from('policy_documents').insert({
    policy_id: request.policy_id,
    section_id: sectionId,
    uploaded_by: request.created_by,
    display_name: request.title,
    original_filename: 'signed-document.pdf',
    storage_path: storagePath,
    mime_type: 'application/pdf',
    size_bytes: sizeBytes,
  });

  if (error) throw new Error(error.message);

  await writeChronology(request, client, 'document_uploaded', `Signed consent filed: ${request.title}`, {
    request_id: requestId,
    section: SIGNED_CONSENTS_SECTION,
  });
}

// ---------------------------------------------------------------------------
// Chronology
// ---------------------------------------------------------------------------

/**
 * Writes to activity_events, the CRM's existing timeline.
 *
 * The event_type prefix matters: the timeline filters on `policy_`, `note_` and
 * `document_` prefixes, so a `consent_` event appears under "All Activity" only.
 * That is deliberate — inventing a fifth filter would mean editing the client and
 * policy monoliths, and consent events genuinely are their own category.
 */
export async function writeChronology(
  request: Pick<SignatureRequest, 'client_id' | 'policy_id' | 'created_by'>,
  client: { id: string },
  eventType: string,
  title: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const admin = getSupabaseAdmin();

  const { error } = await admin.from('activity_events').insert({
    client_id: client.id,
    // Set when the consent has a policy, so the entry shows on the policy's
    // timeline too — activity_events.policy_id is exactly for this.
    policy_id: request.policy_id,
    actor_id: request.created_by,
    event_type: eventType,
    title,
    metadata,
  });

  if (error) throw new Error(error.message);
}
