'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { DashboardConsentRow } from '@/lib/consents/types';
import {
  canRetryGeneration,
  downloadAuditCertificate,
  downloadSignedDocument,
  hasAuditCertificate,
  retryDocumentGeneration,
  retryReason,
} from '@/lib/consents/document-service';

/**
 * Document actions for a signed consent: download the PDF, download the audit
 * certificate, and repair a failed generation.
 *
 * The retry panel is the interesting part. Two different failures land here and
 * they need different words:
 *   - the PDF failed to build   -> there is nothing to download yet
 *   - the PDF is fine but filing it under the policy failed -> the download works,
 *     it just is not in the Documents tab
 * Telling an agent "generation failed" in the second case would send them looking
 * for a document that is right there.
 */

interface ConsentDocumentActionsProps {
  row: DashboardConsentRow;
  onChanged: () => void;
}

export default function ConsentDocumentActions({ row, onChanged }: ConsentDocumentActionsProps) {
  const [certificateExists, setCertificateExists] = useState(false);
  const [busy, setBusy] = useState<'signed' | 'certificate' | 'retry' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isSigned = row.status === 'signed';
  const canRetry = canRetryGeneration(row);
  const reason = retryReason(row);
  const pdfReady = row.final_document_status === 'generated' && Boolean(row.final_file_path);

  // The certificate button only exists once the certificate does — offering a
  // download for a file that is not there is worse than not offering it.
  useEffect(() => {
    if (!isSigned) return;
    let cancelled = false;

    (async () => {
      const exists = await hasAuditCertificate(row.id);
      if (!cancelled) setCertificateExists(exists);
    })();

    return () => {
      cancelled = true;
    };
  }, [row.id, isSigned, row.final_document_status]);

  const flash = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 4000);
  }, []);

  const download = async (which: 'signed' | 'certificate') => {
    setBusy(which);
    setError(null);
    try {
      const url =
        which === 'signed' ? await downloadSignedDocument(row.id) : await downloadAuditCertificate(row.id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download the file.');
    } finally {
      setBusy(null);
    }
  };

  const retry = async () => {
    setBusy('retry');
    setError(null);
    try {
      await retryDocumentGeneration(row.id);
      flash('Done. The document has been filed.');
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The retry failed.');
    } finally {
      setBusy(null);
    }
  };

  if (!isSigned) return null;

  return (
    <div className="space-y-3">
      {notice && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2.5">
          <p className="text-xs font-semibold text-emerald-800">{notice}</p>
        </div>
      )}
      {error && (
        <div className="bg-rose-50 border border-rose-100 rounded-xl px-4 py-2.5">
          <p className="text-xs text-rose-700 font-medium">{error}</p>
        </div>
      )}

      {/* Repair panel — only when there is genuinely something wrong. */}
      {canRetry && reason && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-sm font-bold text-amber-800">
            {row.final_document_status === 'failed'
              ? 'The signed PDF could not be generated'
              : 'The signed PDF is not filed under the policy'}
          </p>
          <p className="text-xs text-amber-700 mt-1">{reason}</p>
          <p className="text-xs text-amber-700 mt-1.5">
            The signature itself is safe and recorded. Your client does not need to sign again.
          </p>
          <button
            type="button"
            onClick={retry}
            disabled={busy !== null}
            className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-60"
          >
            {busy === 'retry' && <Spinner />}
            {busy === 'retry' ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => download('signed')}
          disabled={!pdfReady || busy !== null}
          title={pdfReady ? undefined : 'The signed PDF is not ready yet.'}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy === 'signed' ? <Spinner /> : <DownloadIcon />}
          Download Signed PDF
        </button>

        {certificateExists && (
          <button
            type="button"
            onClick={() => download('certificate')}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-colors disabled:opacity-40"
          >
            {busy === 'certificate' ? <Spinner /> : <DownloadIcon />}
            Download Audit Certificate
          </button>
        )}
      </div>

      <p className="text-[10px] text-slate-400">
        Downloads open a temporary link that expires after one minute.
      </p>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
      />
    </svg>
  );
}
