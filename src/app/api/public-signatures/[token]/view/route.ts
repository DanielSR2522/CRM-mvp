/**
 * GET /api/public-signatures/[token]/view
 *
 * Returns the document for a signer, and records the first view.
 *
 * No session, no cookie, no CRM identity. The token is the entire authorisation,
 * so it is validated before anything is read and the failure is always coarse:
 * a caller must never learn the difference between "no such token" and "that one
 * expired", or this endpoint becomes an oracle for guessing.
 */

import { NextResponse } from 'next/server';
import {
  PublicSigningError,
  httpStatusFor,
  loadPublicDocument,
  publicMessageFor,
  resolveSigningSession,
} from '@/lib/signatures/signature-service';
import { RULES, checkRateLimit, clientIp, clientUserAgent } from '@/lib/signatures/rate-limit';

// The service role client cannot run at build time, and there is nothing here to
// prerender anyway.
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;

  const ip = clientIp(request.headers);
  const userAgent = clientUserAgent(request.headers);

  // Keyed by IP, never by token: keying by token would let anyone holding many
  // tokens sidestep the limit entirely.
  const limit = checkRateLimit(`view:${ip ?? 'unknown'}`, RULES.view);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  try {
    const session = await resolveSigningSession(token);
    const document = await loadPublicDocument(session, { ip, userAgent });

    return NextResponse.json(document, {
      // A signing document must never sit in a shared cache.
      headers: { 'Cache-Control': 'no-store, private' },
    });
  } catch (err) {
    if (err instanceof PublicSigningError) {
      return NextResponse.json(
        { error: publicMessageFor(err.code), code: err.code },
        { status: httpStatusFor(err.code), headers: { 'Cache-Control': 'no-store' } }
      );
    }
    // Never leak an internal message to a stranger.
    console.error('Unexpected error in public view route:', err);
    return NextResponse.json({ error: publicMessageFor('unavailable'), code: 'unavailable' }, { status: 503 });
  }
}
