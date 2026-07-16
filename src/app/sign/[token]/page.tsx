/**
 * /sign/[token] — the public signing page.
 *
 * A Server Component on purpose. The token is resolved and the document loaded
 * before a single byte reaches the browser, which means:
 *   - an invalid or expired link never renders a document at all;
 *   - the service role stays on the server, where it belongs;
 *   - there is no loading flash and no client-side fetch to intercept.
 *
 * No DashboardLayout, no sidebar, no CRM navigation. A client landing here is a
 * stranger to this application and should never see its inside.
 */

import React from 'react';
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import SignDocument from '@/components/signatures/SignDocument';
import {
  PublicSigningError,
  loadPublicDocument,
  publicMessageFor,
  resolveSigningSession,
  type PublicDocument,
  type SigningError,
} from '@/lib/signatures/signature-service';
import { clientIp, clientUserAgent } from '@/lib/signatures/rate-limit';

// Every visit resolves a token and may write a view event. Nothing to prerender.
export const dynamic = 'force-dynamic';

/**
 * Deliberately generic, and noindex.
 *
 * A title carrying the client's name or the document's would leak private
 * information into browser history, link previews and any chat the URL passes
 * through.
 */
export const metadata: Metadata = {
  title: 'Sign document',
  robots: { index: false, follow: false, nocache: true },
};

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const headerList = await headers();
  const meta = {
    ip: clientIp(headerList),
    userAgent: clientUserAgent(headerList),
  };

  // Resolve first, render second. Building JSX inside a try block would put the
  // render itself under the catch, so an error thrown while rendering would be
  // swallowed and shown as "invalid link" — hiding a real bug behind a security
  // message.
  const outcome = await resolveOutcome(token, meta);

  if (!outcome.ok) {
    return (
      <Shell>
        <Unavailable code={outcome.code} />
      </Shell>
    );
  }

  const { document } = outcome;

  return (
    <Shell>
      <SignDocument
        token={token}
        title={document.title}
        agencyName={document.agencyName}
        content={document.content}
        consentText={document.consentText}
        signerName={document.signerName}
        expiresAt={document.expiresAt}
      />
    </Shell>
  );
}

type Outcome =
  | { ok: true; document: PublicDocument }
  | { ok: false; code: SigningError };

/** All the fallible work, with nothing renderable inside the try. */
async function resolveOutcome(
  token: string,
  meta: { ip: string | null; userAgent: string | null }
): Promise<Outcome> {
  try {
    const session = await resolveSigningSession(token);
    const document = await loadPublicDocument(session, meta);
    return { ok: true, document };
  } catch (err) {
    if (err instanceof PublicSigningError) {
      return { ok: false, code: err.code };
    }
    // Log the real thing; show the stranger nothing.
    console.error('Unexpected error rendering the signing page:', err);
    return { ok: false, code: 'unavailable' };
  }
}

/**
 * The page frame.
 *
 * Mobile-first: most clients open these links on a phone, from a text message.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-10">{children}</div>
    </div>
  );
}

/**
 * The failure screen.
 *
 * The message comes from publicMessageFor, which is coarse on purpose: a visitor
 * must never be able to tell "no such token" from "that one expired". The first
 * would make this page an oracle that confirms guesses.
 */
function Unavailable({ code }: { code: SigningError }) {
  const isDone = code === 'completed' || code === 'declined';

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-8 sm:p-10 shadow-sm text-center">
      <div
        className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-4 ${
          isDone ? 'bg-emerald-50' : 'bg-slate-100'
        }`}
      >
        {isDone ? (
          <svg className="w-7 h-7 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.72-3L13.72 4a2 2 0 00-3.44 0L3.35 16a2 2 0 001.72 3z"
            />
          </svg>
        )}
      </div>

      <h1 className="text-lg font-extrabold text-slate-900">
        {code === 'completed'
          ? 'Already signed'
          : code === 'declined'
            ? 'Already declined'
            : code === 'expired'
              ? 'This link has expired'
              : code === 'unavailable'
                ? 'Temporarily unavailable'
                : 'Link not valid'}
      </h1>

      <p className="text-sm text-slate-600 mt-2 max-w-sm mx-auto leading-relaxed">
        {publicMessageFor(code)}
      </p>

      <p className="text-[10px] text-slate-400 mt-6">Secured by SmarTrack</p>
    </div>
  );
}
