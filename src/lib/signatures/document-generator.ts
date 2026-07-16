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

import { createHash } from 'crypto';
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
      // The PDF is already built and is never rebuilt — a second one would carry
      // a different hash and there would be no way to say which the client
      // signed. But the Documents copy may have failed on the first pass, and it
      // is idempotent, so a retry re-attempts just that.
      const repair = await copyToPolicyDocuments(request, client).catch((err) => ({
        ok: false as const,
        error: safeError(err),
      }));

      if (!repair.ok) {
        await noteCopyFailure(requestId, repair.error ?? 'The signed PDF could not be filed under the policy.');
        return {
          ok: false,
          signedPath: request.final_file_path,
          finalHash: request.final_document_hash ?? undefined,
          error: repair.error,
        };
      }

      // Cleared: the copy is in place, so there is nothing left to repair.
      await admin
        .from('signature_requests')
        .update({ final_document_error: null })
        .eq('id', requestId)
        .not('final_document_error', 'is', null);

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
    // Best-effort by design: the canonical PDF exists and is downloadable from
    // Consents & Signatures regardless. A failure to cross-file is an
    // inconvenience to repair, never a reason to mark a good PDF as failed —
    // that would block its download and ask a client to sign again for nothing.
    const copy = await copyToPolicyDocuments({ ...request, final_file_path: signedPath }, client).catch((err) => ({
      ok: false as const,
      error: safeError(err),
    }));

    if (!copy.ok) {
      await noteCopyFailure(requestId, copy.error ?? 'The signed PDF could not be filed under the policy.');
    }

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

interface CopyResult {
  ok: boolean;
  error?: string;
  /** The path inside policy-documents, when the copy is in place. */
  copyPath?: string;
}

/** The presentation copy's path inside the pre-existing policy-documents bucket. */
function policyDocumentsPath(agentId: string, clientId: string, policyId: string, requestId: string): string {
  // agent_id first: the bucket's RLS rule is
  // `auth.uid()::text = split_part(name, '/', 1)`, so any other layout would be
  // invisible to the very agent who owns it.
  return `${agentId}/${clientId}/${policyId}/signed-consents/${requestId}/signed-document.pdf`;
}

/**
 * Puts the signed PDF where the existing Documents tab can find it.
 *
 * TWO COPIES, ONE DOCUMENT — and they are not equals:
 *
 *   signed-documents/…/signed-document.pdf   canonical. The evidence. Referenced
 *                                            by signature_files, hashed in
 *                                            signature_requests.final_document_hash.
 *
 *   policy-documents/…/signed-document.pdf   presentation copy. Exists only so the
 *                                            Documents tab — which reads
 *                                            storage_path from *its* bucket and has
 *                                            no bucket column — can download it
 *                                            without touching its schema.
 *
 * The copy is made by downloading the canonical object and re-uploading those
 * exact bytes, so both files are byte-identical and share a SHA-256. Rebuilding
 * the PDF for the copy would produce a different document with a different hash,
 * and then "which one did the client sign?" would have no answer.
 *
 * signature_files keeps pointing only at the canonical file. policy_documents
 * points only at the copy. Neither ever crosses over.
 *
 * Only runs when the consent has a policy: policy_documents.policy_id and
 * section_id are both NOT NULL, and inventing a policy to satisfy a foreign key
 * would be fabricating a record.
 */
async function copyToPolicyDocuments(
  request: SignatureRequest,
  client: { id: string; agent_id: string }
): Promise<CopyResult> {
  if (!request.policy_id) return { ok: true };
  if (!request.final_file_path) return { ok: false, error: 'The canonical PDF path is missing.' };

  const admin = getSupabaseAdmin();
  const copyPath = policyDocumentsPath(client.agent_id, client.id, request.policy_id, request.id);

  // ---- Already filed? --------------------------------------------------
  // storage_path is UNIQUE on policy_documents, so this both prevents a
  // duplicate row and short-circuits a retry that has nothing left to do.
  const { data: alreadyFiled } = await admin
    .from('policy_documents')
    .select('id')
    .eq('storage_path', copyPath)
    .maybeSingle();

  if (alreadyFiled) return { ok: true, copyPath };

  // ---- The canonical bytes ---------------------------------------------
  const { data: blob, error: downloadError } = await admin.storage
    .from('signed-documents')
    .download(request.final_file_path);

  if (downloadError || !blob) {
    return { ok: false, error: `Could not read the signed PDF: ${downloadError?.message ?? 'missing'}` };
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  // The copy must be the same document, provably. If the canonical file on disk
  // no longer matches what we recorded, something is wrong that copying would
  // only spread.
  if (request.final_document_hash && sha256 !== request.final_document_hash) {
    return {
      ok: false,
      error: 'The stored PDF does not match its recorded hash. Not copying a document that may have been altered.',
    };
  }

  // ---- Upload, without duplicating -------------------------------------
  // upsert:false so a concurrent run cannot have two writers racing over the
  // same object. "Already exists" is a success here, not a failure: it means a
  // previous attempt uploaded the bytes and only the row is missing.
  const { error: uploadError } = await admin.storage
    .from('policy-documents')
    .upload(copyPath, bytes, { contentType: 'application/pdf', upsert: false });

  if (uploadError) {
    const alreadyThere =
      uploadError.message.toLowerCase().includes('already exists') ||
      uploadError.message.toLowerCase().includes('duplicate');

    if (!alreadyThere) {
      return { ok: false, error: `Could not copy the PDF into Documents: ${uploadError.message}` };
    }
  }

  // ---- Find or create the section --------------------------------------
  const sectionResult = await findOrCreateSignedConsentsSection(request.policy_id, request.created_by);
  if (!sectionResult.ok) return { ok: false, error: sectionResult.error };

  // ---- Register --------------------------------------------------------
  // mime_type is hard-coded rather than taken from the blob: this file is one we
  // generated ourselves seconds ago, and it is a PDF by construction. The bucket
  // enforces the whitelist independently.
  const { error: insertError } = await admin.from('policy_documents').insert({
    policy_id: request.policy_id,
    section_id: sectionResult.sectionId,
    uploaded_by: request.created_by,
    display_name: request.title,
    original_filename: 'signed-document.pdf',
    // Points at policy-documents. Never at the canonical file.
    storage_path: copyPath,
    mime_type: 'application/pdf',
    size_bytes: bytes.length,
  });

  if (insertError) {
    // A unique violation means a concurrent run filed it first — which is the
    // outcome we wanted anyway.
    if (insertError.code === '23505') return { ok: true, copyPath };
    return { ok: false, error: `Could not register the document: ${insertError.message}` };
  }

  await writeChronology(request, client, 'document_uploaded', `Signed consent filed: ${request.title}`, {
    request_id: request.id,
    section: SIGNED_CONSENTS_SECTION,
    sha256,
  }).catch((err) => console.error('Could not write Chronology for the filed document:', safeError(err)));

  return { ok: true, copyPath };
}

interface SectionResult {
  ok: boolean;
  sectionId?: string;
  error?: string;
}

/**
 * The "Signed Consents" section, created at most once per policy.
 *
 * The 10-section limit is enforced by a trigger on policy_document_sections.
 * Counting first turns a raised exception into a readable message, and the
 * concurrent-creation path turns a unique violation into a plain lookup.
 */
async function findOrCreateSignedConsentsSection(
  policyId: string,
  createdBy: string
): Promise<SectionResult> {
  const admin = getSupabaseAdmin();

  const { data: existing } = await admin
    .from('policy_document_sections')
    .select('id')
    .eq('policy_id', policyId)
    .eq('name', SIGNED_CONSENTS_SECTION)
    .maybeSingle();

  if (existing?.id) return { ok: true, sectionId: existing.id as string };

  const { count } = await admin
    .from('policy_document_sections')
    .select('id', { count: 'exact', head: true })
    .eq('policy_id', policyId);

  if ((count ?? 0) >= MAX_SECTIONS) {
    return {
      ok: false,
      error: `This policy already has ${count} document sections, the maximum allowed, so "${SIGNED_CONSENTS_SECTION}" could not be created. Remove a section and retry. The signed PDF is safe and downloadable from Consents & Signatures.`,
    };
  }

  const { data: created, error } = await admin
    .from('policy_document_sections')
    .insert({
      policy_id: policyId,
      name: SIGNED_CONSENTS_SECTION,
      position: count ?? 0,
      created_by: createdBy,
    })
    .select('id')
    .single();

  if (created?.id) return { ok: true, sectionId: created.id as string };

  // Someone created it between our lookup and our insert.
  const { data: raced } = await admin
    .from('policy_document_sections')
    .select('id')
    .eq('policy_id', policyId)
    .eq('name', SIGNED_CONSENTS_SECTION)
    .maybeSingle();

  if (raced?.id) return { ok: true, sectionId: raced.id as string };

  return { ok: false, error: error?.message ?? 'Could not create the Signed Consents section.' };
}

/**
 * Records that the Documents copy failed, without touching the PDF's status.
 *
 * final_document_status stays 'generated' on purpose: the signature and the
 * canonical PDF are both fine, and marking them failed would block the download
 * of a perfectly good document. The error lives in final_document_error, which
 * is what makes the Retry button appear.
 */
async function noteCopyFailure(requestId: string, error: string): Promise<void> {
  const admin = getSupabaseAdmin();

  await admin
    .from('signature_requests')
    .update({ final_document_error: error.slice(0, 500) })
    .eq('id', requestId);

  await admin.from('signature_events').insert({
    request_id: requestId,
    performed_by: null,
    event_type: 'final_document_failed',
    metadata: { stage: 'policy_documents_copy', error: error.slice(0, 300) },
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
