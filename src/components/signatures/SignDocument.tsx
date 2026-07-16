'use client';

import React, { useState } from 'react';
import type { TemplateContent } from '@/lib/consents/types';
import PublicDocumentViewer from './PublicDocumentViewer';
import SignatureCanvas from './SignatureCanvas';
import TypedSignature from './TypedSignature';

/**
 * The signing experience.
 *
 * One screen: read the document, accept the consent, sign, done. No account, no
 * navigation, no CRM chrome — a client who lands here should see a document and
 * nothing that suggests they are inside somebody's software.
 *
 * Every guard here is a courtesy. The server refuses an empty signature, an
 * unaccepted consent and a second submission on its own; this just means the
 * signer finds out immediately instead of after a round trip.
 */

interface SignDocumentProps {
  token: string;
  title: string;
  agencyName: string | null;
  content: TemplateContent;
  consentText: string;
  signerName: string;
  expiresAt: string;
}

type Method = 'draw' | 'typed';
type Phase = 'reading' | 'done' | 'declined';

export default function SignDocument({
  token,
  title,
  agencyName,
  content,
  consentText,
  signerName,
  expiresAt,
}: SignDocumentProps) {
  const [phase, setPhase] = useState<Phase>('reading');
  const [method, setMethod] = useState<Method>('draw');
  const [drawnSignature, setDrawnSignature] = useState<string | null>(null);
  const [typedSignature, setTypedSignature] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  const hasSignature = method === 'draw' ? Boolean(drawnSignature) : typedSignature.trim().length > 0;
  const canSign = consentAccepted && hasSignature && !submitting;

  const submit = async () => {
    if (!canSign) return;
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/public-signatures/${token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method,
          signatureImage: method === 'draw' ? drawnSignature : undefined,
          typedSignature: method === 'typed' ? typedSignature.trim() : undefined,
          consentAccepted,
          consentText,
        }),
      });

      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        documentWarning?: string;
      };

      if (!response.ok) {
        setError(body.error ?? 'Something went wrong. Please try again.');
        setSubmitting(false);
        return;
      }

      // The PDF may still be building. The signature is done either way, and
      // saying so is more honest than a spinner that implies otherwise.
      if (body.documentWarning) setWarning(body.documentWarning);
      setPhase('done');
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setSubmitting(false);
    }
  };

  const decline = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/public-signatures/${token}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: declineReason.trim() || null }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? 'Something went wrong. Please try again.');
        setSubmitting(false);
        return;
      }
      setPhase('declined');
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setSubmitting(false);
    }
  };

  // ---- Terminal screens --------------------------------------------------

  if (phase === 'done') {
    return (
      <Outcome
        tone="success"
        title="Thank you — your document is signed"
        message={
          warning ??
          'Your signature has been recorded. A copy has been sent to your agent, who can share it with you.'
        }
        detail={`Signed by ${signerName}`}
      />
    );
  }

  if (phase === 'declined') {
    return (
      <Outcome
        tone="neutral"
        title="You declined this document"
        message="Your response has been recorded and your agent has been notified. Nothing was signed."
        detail="You can close this page."
      />
    );
  }

  // ---- Signing -----------------------------------------------------------

  return (
    <div className="space-y-5">
      {/* Document */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-8 shadow-sm">
        <PublicDocumentViewer content={content} title={title} />
      </div>

      {/* Signing panel */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
        <div>
          <h2 className="text-sm font-extrabold text-slate-900">Sign this document</h2>
          <p className="text-xs text-slate-500 mt-0.5">Signing as {signerName}</p>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
            <p className="text-xs text-rose-700 font-medium">{error}</p>
          </div>
        )}

        {/* Consent — first, because it governs everything below it */}
        <label className="flex gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50/60 cursor-pointer">
          <input
            type="checkbox"
            checked={consentAccepted}
            onChange={(e) => setConsentAccepted(e.target.checked)}
            disabled={submitting}
            className="mt-0.5 w-4 h-4 accent-blue-600 flex-shrink-0"
          />
          <span className="text-xs text-slate-700 leading-relaxed">{consentText}</span>
        </label>

        {/* Method */}
        <div>
          <div className="flex bg-slate-100 p-1 rounded-xl gap-1 w-fit">
            <MethodTab active={method === 'draw'} onClick={() => setMethod('draw')} disabled={submitting}>
              Draw
            </MethodTab>
            <MethodTab active={method === 'typed'} onClick={() => setMethod('typed')} disabled={submitting}>
              Type
            </MethodTab>
          </div>

          <div className="mt-3">
            {method === 'draw' ? (
              <SignatureCanvas onChange={setDrawnSignature} disabled={submitting} />
            ) : (
              <TypedSignature
                value={typedSignature}
                onChange={setTypedSignature}
                suggestedName={signerName}
                disabled={submitting}
              />
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="border-t border-slate-100 pt-5">
          <button
            type="button"
            onClick={submit}
            disabled={!canSign}
            className="w-full px-4 py-3.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99]"
          >
            {submitting ? 'Signing…' : 'Sign Document'}
          </button>

          {/* Say what is missing rather than leaving a dead button. */}
          {!canSign && !submitting && (
            <p className="text-[11px] text-slate-400 text-center mt-2">
              {!consentAccepted
                ? 'Accept the consent above to continue.'
                : 'Add your signature to continue.'}
            </p>
          )}

          <p className="text-[10px] text-slate-400 text-center mt-3">
            This link expires on {formatDate(expiresAt)}.
          </p>
        </div>

        {/* Decline — present, but never competing with the primary action */}
        <div className="border-t border-slate-100 pt-4">
          {!confirmDecline ? (
            <button
              type="button"
              onClick={() => setConfirmDecline(true)}
              disabled={submitting}
              className="w-full text-xs font-semibold text-slate-500 hover:text-rose-600 transition-colors disabled:opacity-50"
            >
              I do not want to sign this
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-800">Decline this document?</p>
              <p className="text-xs text-slate-500">
                Your agent will be notified. Nothing will be signed, and this link will stop working.
              </p>
              <textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                disabled={submitting}
                rows={2}
                maxLength={500}
                placeholder="Reason (optional)"
                className="w-full text-xs text-slate-700 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500 resize-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDecline(false)}
                  disabled={submitting}
                  className="flex-1 px-4 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-xl transition-colors disabled:opacity-50"
                >
                  Go back
                </button>
                <button
                  type="button"
                  onClick={decline}
                  disabled={submitting}
                  className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-60"
                >
                  {submitting ? 'Sending…' : 'Yes, decline'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <p className="text-[10px] text-slate-400 text-center pb-6">
        {agencyName ? `Sent by ${agencyName} · ` : ''}Secured by SmarTrack
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MethodTab({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-5 py-1.5 text-xs font-bold rounded-lg transition-all disabled:opacity-50 ${
        active ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
      }`}
    >
      {children}
    </button>
  );
}

function Outcome({
  tone,
  title,
  message,
  detail,
}: {
  tone: 'success' | 'neutral';
  title: string;
  message: string;
  detail?: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-8 sm:p-10 shadow-sm text-center">
      <div
        className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-4 ${
          tone === 'success' ? 'bg-emerald-50' : 'bg-slate-100'
        }`}
      >
        {tone === 'success' ? (
          <svg className="w-7 h-7 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
      </div>
      <h1 className="text-lg font-extrabold text-slate-900">{title}</h1>
      <p className="text-sm text-slate-600 mt-2 max-w-sm mx-auto leading-relaxed">{message}</p>
      {detail && <p className="text-xs text-slate-400 mt-3">{detail}</p>}
    </div>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${date.getFullYear()}`;
}
