'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { ClientConsentRow } from '@/lib/consents/types';
import { deleteConsentDraft, listClientConsents } from '@/lib/consents/request-service';
import { formatIsoToUsDate } from '@/utils/dateUtils';
import ConsentPreview from './ConsentPreview';
import ConsentStatusBadge from './ConsentStatusBadge';
import NewConsentFlow from './NewConsentFlow';

/**
 * The Consents & Signatures tab inside a client profile.
 *
 * Everything the tab does lives here, so the change to the (very large) client
 * page stays down to mounting one component.
 */

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

  // ---- New consent ------------------------------------------------------
  if (view === 'new') {
    return (
      <NewConsentFlow
        clientId={clientId}
        clientName={clientName}
        onCancel={() => setView('list')}
        onCreated={(message) => {
          setView('list');
          flash(message);
          reload();
        }}
      />
    );
  }

  // ---- Preview ----------------------------------------------------------
  if (view === 'preview' && previewing) {
    return (
      <div className="space-y-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-extrabold text-slate-900 truncate">{previewing.title}</h3>
              <ConsentStatusBadge status={previewing.status} />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {previewing.template_internal_name ?? 'Unknown template'} · Created{' '}
              {formatIsoToUsDate(previewing.created_at)}
            </p>
            {previewing.original_document_hash && (
              <p
                className="text-[10px] text-slate-300 font-mono mt-1 truncate"
                title={previewing.original_document_hash}
              >
                sha256 {previewing.original_document_hash.slice(0, 24)}…
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setView('list');
              setPreviewing(null);
            }}
            className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-xl transition-colors flex-shrink-0"
          >
            Back
          </button>
        </div>

        {/*
          rendered_content and the snapshot are what was frozen at creation, not a
          fresh merge. This is the document as the client will see it, even if the
          template or the client record has changed since.
        */}
        <ConsentPreview
          content={previewing.rendered_content}
          publicTitle={previewing.title}
          consentText={previewing.merge_data_snapshot?.rendered_consent_text ?? ''}
        />
      </div>
    );
  }

  // ---- List -------------------------------------------------------------
  return (
    <div className="space-y-4">
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
            {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    <Th>Title</Th>
                    <Th>Template</Th>
                    <Th>Status</Th>
                    <Th>Created</Th>
                    <Th>Sent</Th>
                    <Th>Viewed</Th>
                    <Th>Signed</Th>
                    <Th>Channel</Th>
                    <Th align="right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {consents.map((row) => (
                    <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <Td>
                        <span className="font-bold text-slate-800">{row.title}</span>
                        {row.signer_name && (
                          <span className="block text-[10px] text-slate-400 mt-0.5">{row.signer_name}</span>
                        )}
                      </Td>
                      <Td>{row.template_internal_name ?? '—'}</Td>
                      <Td>
                        <ConsentStatusBadge status={row.status} />
                      </Td>
                      <Td>{formatIsoToUsDate(row.created_at)}</Td>
                      <Td>{row.sent_at ? formatIsoToUsDate(row.sent_at) : '—'}</Td>
                      <Td>{row.viewed_at ? formatIsoToUsDate(row.viewed_at) : '—'}</Td>
                      <Td>{row.signed_at ? formatIsoToUsDate(row.signed_at) : '—'}</Td>
                      <Td>{row.selected_delivery_channel ? channelLabel(row.selected_delivery_channel) : '—'}</Td>
                      <Td align="right">
                        <RowActions
                          row={row}
                          busy={busyId === row.id}
                          confirming={confirmDelete === row.id}
                          onPreview={() => {
                            setPreviewing(row);
                            setView('preview');
                          }}
                          onAskDelete={() => setConfirmDelete(row.id)}
                          onCancelDelete={() => setConfirmDelete(null)}
                          onConfirmDelete={() => handleDelete(row)}
                        />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="lg:hidden space-y-3">
              {consents.map((row) => (
                <div key={row.id} className="border border-slate-100 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{row.title}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {row.template_internal_name ?? '—'}
                      </p>
                    </div>
                    <ConsentStatusBadge status={row.status} />
                  </div>

                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 mt-3 pt-3 border-t border-slate-50">
                    <MobileMeta label="Created" value={formatIsoToUsDate(row.created_at)} />
                    <MobileMeta label="Sent" value={row.sent_at ? formatIsoToUsDate(row.sent_at) : '—'} />
                    <MobileMeta label="Viewed" value={row.viewed_at ? formatIsoToUsDate(row.viewed_at) : '—'} />
                    <MobileMeta label="Signed" value={row.signed_at ? formatIsoToUsDate(row.signed_at) : '—'} />
                    <MobileMeta
                      label="Channel"
                      value={row.selected_delivery_channel ? channelLabel(row.selected_delivery_channel) : '—'}
                    />
                  </dl>

                  <div className="mt-3 pt-3 border-t border-slate-50 flex justify-end">
                    <RowActions
                      row={row}
                      busy={busyId === row.id}
                      confirming={confirmDelete === row.id}
                      onPreview={() => {
                        setPreviewing(row);
                        setView('preview');
                      }}
                      onAskDelete={() => setConfirmDelete(row.id)}
                      onCancelDelete={() => setConfirmDelete(null)}
                      onConfirmDelete={() => handleDelete(row)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row actions
// ---------------------------------------------------------------------------

/**
 * Actions depend on status. Only a draft can be deleted — everything else is
 * evidence of something that already reached a client, and the database refuses
 * to remove it regardless of what this menu offers.
 */
function RowActions({
  row,
  busy,
  confirming,
  onPreview,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  row: ClientConsentRow;
  busy: boolean;
  confirming: boolean;
  onPreview: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const isDraft = row.status === 'draft';

  if (confirming) {
    return (
      <div className="inline-flex items-center gap-2">
        <span className="text-[10px] font-bold text-slate-500">Delete draft?</span>
        <button
          type="button"
          onClick={onConfirmDelete}
          disabled={busy}
          className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold rounded-lg transition-colors disabled:opacity-50"
        >
          {busy ? 'Deleting…' : 'Yes, delete'}
        </button>
        <button
          type="button"
          onClick={onCancelDelete}
          disabled={busy}
          className="px-2 py-1 border border-slate-200 hover:bg-slate-50 text-slate-600 text-[10px] font-bold rounded-lg transition-colors"
        >
          Keep
        </button>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={onPreview}
        className="px-2.5 py-1 border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 text-slate-600 hover:text-blue-700 text-[10px] font-bold rounded-lg transition-all"
      >
        {isDraft ? 'Continue Draft' : 'View'}
      </button>
      {isDraft && (
        <button
          type="button"
          onClick={onAskDelete}
          disabled={busy}
          className="px-2.5 py-1 border border-slate-200 hover:border-rose-300 hover:bg-rose-50 text-slate-500 hover:text-rose-600 text-[10px] font-bold rounded-lg transition-all disabled:opacity-50"
        >
          Delete
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function channelLabel(channel: string): string {
  const labels: Record<string, string> = {
    email: 'Email',
    whatsapp: 'WhatsApp',
    sms: 'SMS',
    copy_link: 'Link',
  };
  return labels[channel] ?? channel;
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th
      className={`py-2 px-3 text-[9px] font-bold uppercase tracking-wider text-slate-400 ${
        align === 'right' ? 'text-right' : ''
      }`}
    >
      {children}
    </th>
  );
}

function Td({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <td className={`py-3 px-3 text-slate-600 align-top ${align === 'right' ? 'text-right' : ''}`}>
      {children}
    </td>
  );
}

function MobileMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="text-xs text-slate-600 font-semibold">{value}</dd>
    </div>
  );
}
