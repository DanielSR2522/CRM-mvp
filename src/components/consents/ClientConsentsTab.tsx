'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { ClientConsentRow, DashboardConsentRow, SignatureRequestSigner } from '@/lib/consents/types';
import { deleteConsentDraft, getPrimarySigner, listClientConsents } from '@/lib/consents/request-service';
import { downloadSignedDocument } from '@/lib/consents/document-service';
import { DocumentPreviewModal } from '@/components/documents/DocumentPreviewModal';
import { supabase } from '@/lib/supabaseClient';
import { formatDateTimeToUs, formatIsoToUsDate } from '@/utils/dateUtils';
import ConsentPreview from './ConsentPreview';
import ConsentStatusBadge from './ConsentStatusBadge';
import NewConsentFlow from './NewConsentFlow';
import ConsentDocumentActions from './ConsentDocumentActions';

interface ClientConsentsTabProps {
  clientId: string;
  clientName: string;
}

type View = 'list' | 'new' | 'preview';

export default function ClientConsentsTab({ clientId, clientName }: ClientConsentsTabProps) {
  const [consents, setConsents] = useState<ClientConsentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [view, setView] = useState<View>('list');
  const [previewing, setPreviewing] = useState<ClientConsentRow | null>(null);
  const [primarySigner, setPrimarySigner] = useState<SignatureRequestSigner | null>(null);
  const [signatureImgUrl, setSignatureImgUrl] = useState<string | null>(null);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [pdfModalUrl, setPdfModalUrl] = useState<string | null>(null);

  /** The draft being edited. Null when creating a new consent. */
  const [editing, setEditing] = useState<ClientConsentRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 4000);
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await listClientConsents(clientId);
        if (cancelled) return;
        setConsents(rows);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load consents.');
        setConsents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clientId, reloadToken]);

  // Load primary signer details and signed signature image when viewing signed detail
  useEffect(() => {
    if (!previewing || previewing.status !== 'signed') {
      setPrimarySigner(null);
      setSignatureImgUrl(null);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const signer = await getPrimarySigner(previewing.id);
        if (cancelled) return;
        setPrimarySigner(signer);

        if (signer?.signature_image_path) {
          const { data } = await supabase.storage
            .from('signatures')
            .createSignedUrl(signer.signature_image_path, 300);
          if (!cancelled && data?.signedUrl) {
            setSignatureImgUrl(data.signedUrl);
          }
        }
      } catch (err) {
        console.warn('Could not load primary signer signature:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [previewing]);

  useEffect(() => {
    if (!clientId) return;

    const channel = supabase
      .channel(`client_tab_${clientId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'signature_requests',
          filter: `client_id=eq.${clientId}`,
        },
        () => {
          reload();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId, reload]);

  const openRow = (row: ClientConsentRow) => {
    if (row.status === 'draft') {
      setEditing(row);
      setView('new');
      return;
    }
    setPreviewing(row);
    setView('preview');
  };

  const handleDelete = async (row: ClientConsentRow) => {
    setBusyId(row.id);
    setError(null);
    try {
      await deleteConsentDraft(row.id);
      flash('Draft deleted.');
      setConfirmDelete(null);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the draft.');
    } finally {
      setBusyId(null);
    }
  };

  const handleSendEmail = async (row: ClientConsentRow) => {
    setBusyId(row.id);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const accessToken = session?.access_token;

      if (!accessToken) {
        throw new Error('Your session has expired. Sign in again.');
      }

      const response = await fetch(
        `/api/signature-requests/${encodeURIComponent(row.id)}/send-email`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      const result = (await response.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
      };

      if (!response.ok || !result.success) {
        throw new Error(result.error ?? 'The email could not be sent.');
      }

      flash(result.message ?? 'Consent sent by email.');
      reload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'The email could not be sent.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDownloadPdfDirect = async (row: ClientConsentRow) => {
    setBusyId(row.id);
    setError(null);
    try {
      const url = await downloadSignedDocument(row.id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download the file.');
    } finally {
      setBusyId(null);
    }
  };

  const handleViewPdfModal = async () => {
    if (!previewing) return;
    setBusyId(previewing.id);
    setError(null);
    try {
      const url = await downloadSignedDocument(previewing.id);
      setPdfModalUrl(url);
      setIsPdfModalOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open PDF preview.');
    } finally {
      setBusyId(null);
    }
  };

  // ---- New consent / edit draft -----------------------------------------
  if (view === 'new') {
    return (
      <NewConsentFlow
        key={editing?.id ?? 'new'}
        clientId={clientId}
        clientName={clientName}
        editDraft={editing ?? undefined}
        onCancel={() => {
          setEditing(null);
          setView('list');
        }}
        onCreated={(message) => {
          setEditing(null);
          setView('list');
          flash(message);
          reload();
        }}
      />
    );
  }

  // ---- Preview in-workspace ---------------------------------------------
  if (view === 'preview' && previewing) {
    const isSigned = previewing.status === 'signed';
    const pdfReady = previewing.final_document_status === 'generated' && Boolean(previewing.final_file_path);

    return (
      <div className="space-y-6 font-sans animate-fade-in">
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-extrabold text-slate-900">{previewing.title}</h3>
            <ConsentStatusBadge status={previewing.status} />
          </div>

          <div className="flex items-center gap-2">
            {isSigned && (
              <>
                <button
                  type="button"
                  disabled={!pdfReady}
                  onClick={handleViewPdfModal}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs disabled:opacity-40 flex items-center gap-1.5"
                >
                  <span>👁️</span> View PDF
                </button>
                <button
                  type="button"
                  disabled={!pdfReady}
                  onClick={() => handleDownloadPdfDirect(previewing)}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs disabled:opacity-40 flex items-center gap-1.5"
                >
                  <span>⬇️</span> Download PDF
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setView('list');
                setPreviewing(null);
              }}
              className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-colors"
            >
              Close
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                  Document Preview
                </h4>
                <span className="text-[11px] font-medium text-slate-400">
                  Frozen Content Snapshot
                </span>
              </div>

              <div className="max-h-[520px] overflow-y-auto pr-1">
                <ConsentPreview
                  content={previewing.rendered_content}
                  publicTitle={previewing.title}
                  consentText={previewing.merge_data_snapshot?.rendered_consent_text ?? ''}
                />
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 space-y-6">
            {isSigned && (
              <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                    Client Signature
                  </h4>
                  {primarySigner?.signature_method && (
                    <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                      {primarySigner.signature_method === 'draw' ? 'Drawn Signature' : 'Typed Signature'}
                    </span>
                  )}
                </div>

                <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-4 min-h-[120px] flex items-center justify-center relative overflow-hidden">
                  {signatureImgUrl ? (
                    <img
                      src={signatureImgUrl}
                      alt="Client Signature"
                      className="max-h-24 max-w-full object-contain"
                    />
                  ) : primarySigner?.typed_signature || previewing.signer_name ? (
                    <div className="text-center py-2">
                      <span className="text-2xl font-serif italic text-slate-900 tracking-wide font-medium">
                        {primarySigner?.typed_signature || previewing.signer_name}
                      </span>
                      <span className="block text-[10px] text-slate-400 font-sans mt-1">
                        Electronically typed signature
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400 italic">Signature image loading or recorded</span>
                  )}
                </div>

                <div className="border-t border-slate-100 pt-3">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Signed By
                  </span>
                  <div className="text-xs font-bold text-slate-800">
                    {previewing.signer_name || 'Unknown Signer'}
                  </div>
                  {previewing.signer_email && (
                    <div className="text-xs text-slate-500 font-mono mt-0.5">
                      {previewing.signer_email}
                    </div>
                  )}
                  {primarySigner?.phone && (
                    <div className="text-xs text-slate-500 mt-0.5">
                      {primarySigner.phone}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                  Legal Record &amp; Audit
                </h4>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md">
                  Verified
                </span>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Delivery Channel
                  </span>
                  <span className="font-semibold text-slate-800">
                    {previewing.selected_delivery_channel
                      ? channelLabel(previewing.selected_delivery_channel)
                      : '—'}
                  </span>
                </div>

                {previewing.sent_at && (
                  <div>
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Sent Timestamp
                    </span>
                    <span className="font-semibold text-slate-800">
                      {formatDateTimeToUs(previewing.sent_at)}
                    </span>
                  </div>
                )}

                {previewing.viewed_at && (
                  <div>
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Viewed Timestamp
                    </span>
                    <span className="font-semibold text-slate-800">
                      {formatDateTimeToUs(previewing.viewed_at)}
                    </span>
                  </div>
                )}

                {previewing.signed_at && (
                  <div>
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Signed Timestamp
                    </span>
                    <span className="font-semibold text-emerald-700 font-bold">
                      {formatDateTimeToUs(previewing.signed_at)}
                    </span>
                  </div>
                )}

                <div className="border-t border-slate-100 pt-2">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Request ID
                  </span>
                  <span className="font-mono text-[10px] text-slate-500 break-all">
                    {previewing.id}
                  </span>
                </div>

                {previewing.final_document_hash && (
                  <div>
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      SHA-256 Hash
                    </span>
                    <span className="font-mono text-[10px] text-slate-500 break-all">
                      {previewing.final_document_hash}
                    </span>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100 pt-3">
                <ConsentDocumentActions
                  row={previewing as unknown as DashboardConsentRow}
                  onChanged={reload}
                />
              </div>
            </div>
          </div>
        </div>

        {isPdfModalOpen && pdfModalUrl && (
          <DocumentPreviewModal
            isOpen={isPdfModalOpen}
            onClose={() => {
              setIsPdfModalOpen(false);
              setPdfModalUrl(null);
            }}
            fileName={`${previewing.title || 'Signed_Consent'}.pdf`}
            mimeType="application/pdf"
            signedUrl={pdfModalUrl}
            onDownload={() => handleDownloadPdfDirect(previewing)}
          />
        )}
      </div>
    );
  }

  // ---- List -------------------------------------------------------------
  return (
    <div className="space-y-4 font-sans">
      {notice && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
          <p className="text-sm font-semibold text-emerald-800">{notice}</p>
        </div>
      )}
      {error && (
        <div className="bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-rose-800">Something went wrong</p>
            <p className="text-xs text-rose-700 mt-0.5">{error}</p>
          </div>
          <button
            type="button"
            onClick={reload}
            className="text-xs font-bold text-rose-700 hover:text-rose-900 whitespace-nowrap"
          >
            Retry
          </button>
        </div>
      )}

      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-50 pb-4">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">Consents &amp; Signatures</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Documents this client has been asked to review and sign.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setView('new')}
            className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md shadow-blue-500/10"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            New Consent
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="border border-slate-100 rounded-xl p-4 animate-pulse">
                <div className="h-4 bg-slate-100 rounded w-1/3" />
                <div className="h-3 bg-slate-50 rounded w-2/3 mt-2.5" />
              </div>
            ))}
          </div>
        ) : consents.length === 0 ? (
          <div className="text-center py-10">
            <div className="w-12 h-12 mx-auto rounded-xl bg-slate-50 flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <p className="text-sm font-bold text-slate-700">No consents yet</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Create one from an active template. The client&apos;s details are filled in
              automatically.
            </p>
            <button
              type="button"
              onClick={() => setView('new')}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors"
            >
              + New Consent
            </button>
          </div>
        ) : (
          <>
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-3">TITLE</th>
                    <th className="py-3 px-3">STATUS</th>
                    <th className="py-3 px-3">DELIVERY</th>
                    <th className="py-3 px-3">ACTIVITY</th>
                    <th className="py-3 px-3 text-right">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {consents.map((row) => {
                    const isSigned = row.status === 'signed';
                    const isDraft = row.status === 'draft';
                    const pdfReady = row.final_document_status === 'generated' && Boolean(row.final_file_path);

                    return (
                      <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="py-3.5 px-3">
                          <div className="font-extrabold text-slate-900 text-sm">{row.title}</div>
                          {row.template_internal_name && row.template_internal_name !== row.title && (
                            <div className="text-[10px] text-slate-400 font-medium mt-0.5">
                              {row.template_internal_name}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-3">
                          <ConsentStatusBadge status={row.status} />
                        </td>
                        <td className="py-3.5 px-3">
                          <div className="font-bold text-slate-800">
                            {row.selected_delivery_channel ? channelLabel(row.selected_delivery_channel) : '—'}
                          </div>
                          {row.signer_email && (
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate max-w-[180px]">
                              {row.signer_email}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-3">
                          <div className="space-y-0.5 text-[11px] text-slate-600 font-medium">
                            {row.sent_at && (
                              <div><span className="text-slate-400 text-[10px]">Sent:</span> {formatIsoToUsDate(row.sent_at)}</div>
                            )}
                            {row.viewed_at && (
                              <div><span className="text-slate-400 text-[10px]">Viewed:</span> {formatIsoToUsDate(row.viewed_at)}</div>
                            )}
                            {row.signed_at ? (
                              <div className="text-emerald-700 font-bold">
                                <span className="text-emerald-600 text-[10px]">Signed:</span> {formatDateTimeToUs(row.signed_at)}
                              </div>
                            ) : !row.sent_at && !row.viewed_at ? (
                              <div><span className="text-slate-400 text-[10px]">Created:</span> {formatIsoToUsDate(row.created_at)}</div>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openRow(row)}
                              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs"
                            >
                              {isSigned ? 'Preview' : isDraft ? 'Continue' : 'View Status'}
                            </button>

                            {isSigned && (
                              <button
                                type="button"
                                disabled={!pdfReady || busyId === row.id}
                                onClick={() => handleDownloadPdfDirect(row)}
                                className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                Download PDF
                              </button>
                            )}

                            {(isDraft || row.status === 'pending' || row.status === 'failed') && (
                              <button
                                type="button"
                                disabled={busyId === row.id || !row.signer_email?.trim()}
                                onClick={() => handleSendEmail(row)}
                                className="px-2.5 py-1 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-xl transition-all disabled:opacity-40"
                              >
                                {busyId === row.id ? 'Sending...' : 'Email'}
                              </button>
                            )}

                            {isDraft && (
                              <button
                                type="button"
                                onClick={() => setConfirmDelete(row.id)}
                                className="px-2.5 py-1 text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 text-xs font-bold rounded-xl transition-all"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="lg:hidden space-y-3">
              {consents.map((row) => {
                const isSigned = row.status === 'signed';
                const isDraft = row.status === 'draft';
                const pdfReady = row.final_document_status === 'generated' && Boolean(row.final_file_path);

                return (
                  <div key={row.id} className="border border-slate-100 rounded-xl p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{row.title}</p>
                        {row.template_internal_name && row.template_internal_name !== row.title && (
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {row.template_internal_name}
                          </p>
                        )}
                      </div>
                      <ConsentStatusBadge status={row.status} />
                    </div>

                    <div className="bg-slate-50 rounded-lg p-2.5 text-xs space-y-1">
                      <div className="flex items-center justify-between text-slate-500">
                        <span>Delivery:</span>
                        <span className="font-bold text-slate-800">
                          {row.selected_delivery_channel ? channelLabel(row.selected_delivery_channel) : '—'}
                        </span>
                      </div>
                      {row.sent_at && (
                        <div className="flex items-center justify-between text-slate-500">
                          <span>Sent:</span>
                          <span className="font-medium text-slate-700">{formatIsoToUsDate(row.sent_at)}</span>
                        </div>
                      )}
                      {row.signed_at && (
                        <div className="flex items-center justify-between text-emerald-700 font-bold">
                          <span>Signed:</span>
                          <span>{formatDateTimeToUs(row.signed_at)}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2 border-t border-slate-50 pt-2">
                      <button
                        type="button"
                        onClick={() => openRow(row)}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all"
                      >
                        {isSigned ? 'Preview' : isDraft ? 'Continue' : 'View Status'}
                      </button>

                      {isSigned && (
                        <button
                          type="button"
                          disabled={!pdfReady || busyId === row.id}
                          onClick={() => handleDownloadPdfDirect(row)}
                          className="px-3 py-1.5 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all"
                        >
                          Download PDF
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function channelLabel(channel: string): string {
  switch (channel) {
    case 'email':
      return 'Email';
    case 'whatsapp':
      return 'WhatsApp';
    case 'sms':
      return 'SMS';
    case 'copy_link':
      return 'Shared Link';
    default:
      return channel ? channel.toUpperCase() : '—';
  }
}
