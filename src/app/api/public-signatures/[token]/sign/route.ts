/**
 * POST /api/public-signatures/[token]/sign
 *
 * Completes a signature.
 *
 * Everything the browser sends is untrusted input: the method, the image, the
 * consent flag, the consent text. All of it is validated server-side. IP and
 * user-agent are taken from the request headers here and never from the body —
 * a self-reported IP is not evidence of anything.
 *
 * Double signing is prevented in signature-service by a conditional update, and
 * again by a database trigger. This route's job is to validate, delegate, and
 * then kick off PDF generation without letting a PDF failure touch the signature.
 */

import { NextResponse } from 'next/server';
import {
  PublicSigningError,
  httpStatusFor,
  publicMessageFor,
  resolveSigningSession,
  signDocument,
  type SignInput,
} from '@/lib/signatures/signature-service';
import { generateFinalDocuments } from '@/lib/signatures/document-generator';
import { RULES, checkRateLimit, clientIp, clientUserAgent } from '@/lib/signatures/rate-limit';

export const dynamic = 'force-dynamic';

/** A drawn signature PNG plus JSON overhead. Rejected before parsing. */
const MAX_BODY_BYTES = 3_000_000;

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;

  const ip = clientIp(request.headers);
  const userAgent = clientUserAgent(request.headers);

  const limit = checkRateLimit(`sign:${ip ?? 'unknown'}`, RULES.sign);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'That signature is too large.' }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: publicMessageFor('invalid'), code: 'invalid' }, { status: 400 });
  }

  const payload = body as Partial<SignInput>;

  try {
    const session = await resolveSigningSession(token);

    const result = await signDocument(
      session,
      {
        method: payload.method === 'draw' ? 'draw' : 'typed',
        signatureImage: typeof payload.signatureImage === 'string' ? payload.signatureImage : undefined,
        typedSignature: typeof payload.typedSignature === 'string' ? payload.typedSignature : undefined,
        consentAccepted: payload.consentAccepted === true,
        // The consent text is echoed back by the client, but it is not trusted as
        // the source: signDocument snapshots whatever it receives, and the value
        // shown to the signer came from us in the first place. Sending it back is
        // how we record what was on screen at that moment.
        consentText: typeof payload.consentText === 'string' ? payload.consentText : '',
      },
      { ip, userAgent }
    );

    // The signature is safe at this point. Generation is awaited so the signer
    // usually lands on a page with a real download, but its failure is caught and
    // reported as a warning — never as a failed signature.
    let documentWarning: string | undefined;
    try {
      const generation = await generateFinalDocuments(session.request.id);
      if (!generation.ok) {
        documentWarning =
          'Your signature was recorded. The PDF copy is still being prepared and your agent will send it shortly.';
      }
    } catch (err) {
      console.error('PDF generation threw after a successful signature:', err);
      documentWarning =
        'Your signature was recorded. The PDF copy is still being prepared and your agent will send it shortly.';
    }

    return NextResponse.json(
      { signedAt: result.signedAt, documentWarning },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    if (err instanceof PublicSigningError) {
      return NextResponse.json(
        { error: publicMessageFor(err.code), code: err.code },
        { status: httpStatusFor(err.code), headers: { 'Cache-Control': 'no-store' } }
      );
    }
    console.error('Unexpected error in public sign route:', err);
    return NextResponse.json({ error: publicMessageFor('unavailable'), code: 'unavailable' }, { status: 503 });
  }
}
