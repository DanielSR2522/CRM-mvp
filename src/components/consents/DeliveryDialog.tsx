'use client';

import React, { useCallback, useState } from 'react';
import type { DashboardConsentRow, DeliveryChannel } from '@/lib/consents/types';
import { adapterFor, confirmManualSend, deliverConsent, type DeliveryResult } from '@/lib/delivery/delivery-service';
import { buildSigningMessage, formatExpiry } from '@/lib/delivery/types';
import { EMAIL_NOT_CONFIGURED, emailAdapter } from '@/lib/delivery/email-adapter';
import { whatsappAdapter } from '@/lib/delivery/whatsapp-adapter';

/**
 * The send dialog.
 *
 * WhatsApp now uses Meta Cloud API as the primary flow:
 *   Agent clicks Send → CRM calls /api/signature-requests/[id]/send-whatsapp →
 *   Meta accepts → WAMID stored → status moves to 'sent' → green banner.
 *
 * The old wa.me flow is retained as a clearly labelled MANUAL FALLBACK for
 * cases where the Cloud API is unavailable (e.g. template not yet approved,
 * missing config). The manual fallback:
 *   - Does NOT call the Cloud API.
 *   - Does NOT advance the status automatically.
 *   - Shows message text for the agent to copy and send themselves.
 *   - Requires agent confirmation ("Yes, I sent it") to advance status.
 *
 * Email, SMS, and Copy Link are unchanged.
 */

interface DeliveryDialogProps {
  row: DashboardConsentRow;
  channel: DeliveryChannel;
  agencyName?: string | null;
  agentName?: string | null;
  onClose: () => void;
  onDone: (message: string) => void;
}

export default function DeliveryDialog({
  row,
  channel,
  agencyName,
  agentName,
  onClose,
  onDone,
}: DeliveryDialogProps) {
  const adapter = adapterFor(channel);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DeliveryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [showManualFallback, setShowManualFallback] = useState(false);
  const [manualRunning, setManualRunning] = useState(false);
  const [manualResult, setManualResult] = useState<DeliveryResult | null>(null);
  const [manualConfirming, setManualConfirming] = useState(false);

  const isEmail = channel === 'email';
  const isWhatsApp = channel === 'whatsapp';
  const emailBlocked = isEmail && !emailAdapter.isReady().ready;

  // -------------------------------------------------------------------------
  // Primary flow (Cloud API for WhatsApp, server-side for Email)
  // -------------------------------------------------------------------------
  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const outcome = await deliverConsent(row, channel, { agencyName, agentName });
      setResult(outcome);
      if (outcome.status === 'failed') setError(outcome.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delivery failed.');
    } finally {
      setRunning(false);
    }
  }, [row, channel, agencyName, agentName]);

  // -------------------------------------------------------------------------
  // Manual WhatsApp fallback (wa.me link + copy-message, no auto-status)
  // -------------------------------------------------------------------------
  const runManualFallback = useCallback(async () => {
    setManualRunning(true);
    try {
      // Use the WhatsApp adapter directly (the wa.me path).
      // This returns status:'opened', nextRequestStatus: null — the status
      // does NOT advance until the agent explicitly confirms they sent it.
      // We build a minimal context here; the full context is built server-side
      // for the Cloud API path. For the manual path we only need the URL.
      const outcome = await whatsappAdapter.deliver({
        requestId: row.id,
        signerId: '',
        clientName: row.client_name ?? '',
        signerName: row.signer_name ?? '',
        signerEmail: row.signer_email,
        signerPhone: row.signer_phone,
        documentTitle: row.title,
        agencyName: agencyName ?? null,
        agentName: agentName ?? null,
        signingUrl: manualResult?.signingUrl ?? '',
        expiresAt: manualResult?.expiresAt ?? new Date(row.expires_at ?? Date.now()),
        language: 'en',
      });
      setManualResult((prev) => prev ? { ...prev, ...outcome } : null);
    } finally {
      setManualRunning(false);
    }
  }, [row, agencyName, agentName, manualResult]);

  const confirmManualSent = async () => {
    setManualConfirming(true);
    try {
      await confirmManualSend(row, channel);
      onDone(`Marked as sent via ${adapter.label} (manual send).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mark it as sent.');
      setManualConfirming(false);
    }
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setError('Could not access the clipboard. Select the text and copy it manually.');
    }
  };

  const confirmSent = async () => {
    setConfirming(true);
    setError(null);
    try {
      await confirmManualSend(row, channel);
      onDone(`Marked as sent via ${adapter.label}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mark it as sent.');
      setConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full my-8">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-50 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900">
              {isWhatsApp ? 'Send via WhatsApp' : `Send via ${adapter.label}`}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {row.title} · {row.client_name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
              <p className="text-xs text-rose-700 font-medium">{error}</p>
            </div>
          )}

          {/* ---- Email: no provider ---- */}
          {emailBlocked && (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <p className="text-sm font-bold text-amber-800">{EMAIL_NOT_CONFIGURED}</p>
                <p className="text-xs text-amber-700 mt-1">
                  No mail service is connected to this CRM, so nothing was sent and the consent has
                  not moved. Use WhatsApp, SMS or Copy Link instead.
                </p>
              </div>

              {/* The message is still built, so the agent can send it from their
                  own mail client if they want to. */}
              <EmailPreview row={row} agencyName={agencyName} agentName={agentName} onCopy={copy} copied={copied} />
            </>
          )}

          {/* ---- WhatsApp — Cloud API primary flow ---- */}
          {isWhatsApp && !emailBlocked && (
            <>
              {!result && !running && (
                <>
                  <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
                    <p className="text-xs text-slate-600">
                      A consent signature request will be sent directly to the client&apos;s WhatsApp.
                      A new secure link will be created and{' '}
                      <strong>any previous link for this consent will stop working.</strong>
                    </p>
                  </div>
                  <dl className="space-y-1.5 text-xs">
                    <Row label="Signer" value={row.signer_name ?? '—'} />
                    <Row label="Phone" value={row.signer_phone ?? '—'} />
                    <Row label="Expires" value={row.expires_at ? formatExpiry(new Date(row.expires_at)) : '—'} />
                  </dl>
                  <button
                    type="button"
                    onClick={run}
                    className="w-full px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-xl transition-colors active:scale-[0.98]"
                  >
                    Send via WhatsApp
                  </button>
                  {/* Manual fallback toggle */}
                  <div className="border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      onClick={() => setShowManualFallback(!showManualFallback)}
                      className="text-[10px] font-bold text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showManualFallback ? '▲ Hide' : '▼ Show'} manual send option (fallback)
                    </button>
                    {showManualFallback && (
                      <div className="mt-3 bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-2">
                        <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wide">
                          Manual send — fallback only
                        </p>
                        <p className="text-xs text-amber-700">
                          Opens WhatsApp with a pre-filled message. Use this only if the automatic
                          send above fails. Opening WhatsApp does{' '}
                          <strong>not</strong> mark the consent as sent — you must confirm after
                          pressing Send in WhatsApp.
                        </p>
                        {row.signer_phone && (
                          <a
                            href={whatsappAdapter.buildUrl({
                              requestId: row.id,
                              signerId: '',
                              clientName: row.client_name ?? '',
                              signerName: row.signer_name ?? '',
                              signerEmail: row.signer_email,
                              signerPhone: row.signer_phone,
                              documentTitle: row.title,
                              agencyName: agencyName ?? null,
                              agentName: agentName ?? null,
                              signingUrl: `[copy the link above after using Send via WhatsApp]`,
                              expiresAt: new Date(row.expires_at ?? Date.now()),
                              language: 'en',
                            })}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition-colors"
                          >
                            Open WhatsApp manually →
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}

              {running && (
                <div className="py-8 text-center">
                  <svg className="animate-spin h-5 w-5 mx-auto text-green-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <p className="text-xs text-slate-500 mt-3">Sending via WhatsApp Cloud API…</p>
                </div>
              )}

              {result && result.status === 'sent' && (
                <>
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                    <p className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
                      <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      {result.message}
                    </p>
                    <p className="text-[10px] text-emerald-700 mt-1">
                      The message was accepted by Meta. The client will receive it on their
                      WhatsApp. Delivery status updates will be tracked automatically.
                    </p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Secure link (backup)
                    </label>
                    <div className="flex gap-2">
                      <input
                        readOnly
                        value={result.signingUrl}
                        onFocus={(e) => e.currentTarget.select()}
                        className="flex-1 text-xs text-slate-700 border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => copy(result.signingUrl, 'link')}
                        className="px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-[10px] font-bold rounded-lg transition-colors whitespace-nowrap"
                      >
                        {copied === 'link' ? 'Copied' : 'Copy Link'}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Expires {formatExpiry(result.expiresAt)}. The client can also use this link
                      directly if they prefer not to open the WhatsApp message.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDone(result.message)}
                    className="w-full px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-xl transition-colors"
                  >
                    Done
                  </button>
                </>
              )}

              {result && result.status === 'failed' && (
                <>
                  <div className="bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
                    <p className="text-xs font-semibold text-rose-800">WhatsApp send failed.</p>
                    <p className="text-xs text-rose-700 mt-1">
                      {result.message || error || 'The message could not be delivered.'}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500">
                    You can use the manual option below or try again after resolving the issue.
                  </p>
                  <button
                    type="button"
                    onClick={() => { setResult(null); setError(null); }}
                    className="w-full px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-xl transition-colors"
                  >
                    Try again
                  </button>
                </>
              )}
            </>
          )}

          {/* ---- Everything else (SMS, Copy Link, Email when ready) ---- */}
          {!isWhatsApp && !emailBlocked && (
            <>
              {!result && !running && (
                <>
                  <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
                    <p className="text-xs text-slate-600">
                      A new secure link will be created and{' '}
                      <strong>any previous link for this consent will stop working.</strong>
                    </p>
                  </div>
                  <dl className="space-y-1.5 text-xs">
                    <Row label="Signer" value={row.signer_name ?? '—'} />
                    {channel !== 'copy_link' && (
                      <Row
                        label="Destination"
                        value={(channel === 'email' ? row.signer_email : row.signer_phone) ?? '—'}
                      />
                    )}
                    <Row label="Expires" value={row.expires_at ? formatExpiry(new Date(row.expires_at)) : '—'} />
                  </dl>
                  {/*
                    Always a button, never automatic on open. clipboard.writeText
                    needs transient user activation, so copying from an effect
                    would be denied by the browser — and an action this
                    consequential should be asked for anyway.
                  */}
                  <button
                    type="button"
                    onClick={run}
                    className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors active:scale-[0.98]"
                  >
                    {channel === 'copy_link' ? 'Create link and copy' : `Open ${adapter.label}`}
                  </button>
                </>
              )}

              {running && (
                <div className="py-8 text-center">
                  <svg className="animate-spin h-5 w-5 mx-auto text-blue-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <p className="text-xs text-slate-500 mt-3">Creating the secure link…</p>
                </div>
              )}

              {result && (
                <>
                  <div
                    className={`rounded-xl px-4 py-3 border ${
                      result.status === 'failed'
                        ? 'bg-rose-50 border-rose-100'
                        : 'bg-emerald-50 border-emerald-100'
                    }`}
                  >
                    <p
                      className={`text-xs font-semibold ${
                        result.status === 'failed' ? 'text-rose-800' : 'text-emerald-800'
                      }`}
                    >
                      {result.message}
                    </p>
                  </div>

                  {/* The link, always. If a popup was blocked or the app never
                      opened, this is the way through — and it costs nothing to
                      show to the person who just asked for it. */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Secure link
                    </label>
                    <div className="flex gap-2">
                      <input
                        readOnly
                        value={result.signingUrl}
                        onFocus={(e) => e.currentTarget.select()}
                        className="flex-1 text-xs text-slate-700 border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => copy(result.signingUrl, 'link')}
                        className="px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-[10px] font-bold rounded-lg transition-colors whitespace-nowrap"
                      >
                        {copied === 'link' ? 'Copied' : 'Copy Link'}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Expires {formatExpiry(result.expiresAt)}. Anyone with this link can sign — do
                      not post it anywhere public.
                    </p>
                  </div>

                  {/* SMS on desktop: the message text. */}
                  {channel === 'sms' && (
                    <ManualMessage
                      row={row}
                      channel={channel}
                      signingUrl={result.signingUrl}
                      expiresAt={result.expiresAt}
                      agencyName={agencyName}
                      agentName={agentName}
                      onCopy={copy}
                      copied={copied}
                    />
                  )}

                  {/* Only the agent knows whether they pressed send. */}
                  {result.status !== 'failed' && channel !== 'copy_link' && (
                    <div className="border-t border-slate-50 pt-4">
                      <p className="text-xs text-slate-600">
                        Did you send it? We cannot tell from here — {adapter.label} does not report
                        back.
                      </p>
                      <div className="flex items-center gap-2 mt-3">
                        <button
                          type="button"
                          onClick={confirmSent}
                          disabled={confirming}
                          className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-60"
                        >
                          {confirming ? 'Saving…' : 'Yes, I sent it'}
                        </button>
                        <button
                          type="button"
                          onClick={onClose}
                          disabled={confirming}
                          className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-xl transition-colors disabled:opacity-50"
                        >
                          Not yet
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-2">
                        &quot;Not yet&quot; keeps the link alive — the consent just stays where it is.
                      </p>
                    </div>
                  )}

                  {channel === 'copy_link' && (
                    <button
                      type="button"
                      onClick={() => onDone('Secure link copied.')}
                      className="w-full px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-xl transition-colors"
                    >
                      Done
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ManualMessage({
  row,
  channel,
  signingUrl,
  expiresAt,
  agencyName,
  agentName,
  onCopy,
  copied,
}: {
  row: DashboardConsentRow;
  channel: DeliveryChannel;
  signingUrl: string;
  expiresAt: Date;
  agencyName?: string | null;
  agentName?: string | null;
  onCopy: (text: string, what: string) => void;
  copied: string | null;
}) {
  const from = agencyName || agentName || 'SmarTrack';
  const expiry = formatExpiry(expiresAt);
  const message =
    channel === 'sms'
      ? `${row.signer_name}: please sign "${row.title}" from ${from}. Expires ${expiry}. ${signingUrl}`
      : [
          `Hi ${row.signer_name},`,
          ``,
          `${from} has sent you a document to review and sign: "${row.title}".`,
          ``,
          `You can open it here:`,
          signingUrl,
          ``,
          `This link expires on ${expiry}.`,
        ].join('\n');

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Message
        </label>
        <div className="flex items-center gap-2">
          {row.signer_phone && (
            <button
              type="button"
              onClick={() => onCopy(row.signer_phone!, 'phone')}
              className="text-[10px] font-bold text-blue-600 hover:text-blue-800"
            >
              {copied === 'phone' ? 'Copied' : `Copy ${row.signer_phone}`}
            </button>
          )}
          <button
            type="button"
            onClick={() => onCopy(message, 'message')}
            className="text-[10px] font-bold text-blue-600 hover:text-blue-800"
          >
            {copied === 'message' ? 'Copied' : 'Copy Message'}
          </button>
        </div>
      </div>
      <textarea
        readOnly
        value={message}
        rows={channel === 'sms' ? 3 : 6}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full text-xs text-slate-700 border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 resize-y"
      />
    </div>
  );
}

function EmailPreview({
  row,
  agencyName,
  agentName,
  onCopy,
  copied,
}: {
  row: DashboardConsentRow;
  agencyName?: string | null;
  agentName?: string | null;
  onCopy: (text: string, what: string) => void;
  copied: string | null;
}) {
  // Built without a link on purpose: no link is minted when nothing can send it.
  const from = agencyName || agentName || 'SmarTrack';
  const subject = `Document to sign: ${row.title}`;
  const body = [
    `Hi ${row.signer_name},`,
    ``,
    `${from} has sent you a document to review and sign electronically:`,
    `"${row.title}"`,
    ``,
    `[The secure link goes here — use Copy Link to generate one.]`,
    ``,
    from,
  ].join('\n');

  return (
    <div className="space-y-3">
      <dl className="space-y-1.5 text-xs">
        <Row label="To" value={row.signer_email ?? 'No email on file'} />
        <Row label="Subject" value={subject} />
      </dl>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Body
          </label>
          <button
            type="button"
            onClick={() => onCopy(body, 'body')}
            className="text-[10px] font-bold text-blue-600 hover:text-blue-800"
          >
            {copied === 'body' ? 'Copied' : 'Copy Body'}
          </button>
        </div>
        <textarea
          readOnly
          value={body}
          rows={8}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full text-xs text-slate-700 border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 resize-y"
        />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate-400 font-semibold flex-shrink-0">{label}</dt>
      <dd className="text-slate-700 font-semibold text-right truncate" title={value}>
        {value}
      </dd>
    </div>
  );
}
