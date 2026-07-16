/**
 * POST /api/public-signatures/[token]/decline
 *
 * Records a refusal to sign.
 *
 * Declining is as final as signing and gets the same protections: the same
 * conditional claim, the same audit capture, the same coarse errors. A signer
 * who declines can never then sign, and the trigger enforces that independently.
 */

import { NextResponse } from 'next/server';
import {
  PublicSigningError,
  declineDocument,
  httpStatusFor,
  publicMessageFor,
  resolveSigningSession,
} from '@/lib/signatures/signature-service';
import { RULES, checkRateLimit, clientIp, clientUserAgent } from '@/lib/signatures/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;

  const ip = clientIp(request.headers);
  const userAgent = clientUserAgent(request.headers);

  const limit = checkRateLimit(`decline:${ip ?? 'unknown'}`, RULES.decline);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  let reason: string | null = null;
  try {
    const body = (await request.json()) as { reason?: unknown };
    if (typeof body?.reason === 'string') reason = body.reason;
  } catch {
    // A reason is optional. An unparseable body is not a reason to refuse the
    // decline — the signer's intent is in the request, not the payload.
  }

  try {
    const session = await resolveSigningSession(token);
    await declineDocument(session, reason, { ip, userAgent });

    return NextResponse.json({ declined: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    if (err instanceof PublicSigningError) {
      return NextResponse.json(
        { error: publicMessageFor(err.code), code: err.code },
        { status: httpStatusFor(err.code), headers: { 'Cache-Control': 'no-store' } }
      );
    }
    console.error('Unexpected error in public decline route:', err);
    return NextResponse.json({ error: publicMessageFor('unavailable'), code: 'unavailable' }, { status: 503 });
  }
}
