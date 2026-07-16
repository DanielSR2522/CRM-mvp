'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import ConsentFilters, { EMPTY_FILTERS, hasActiveFilters, type FilterState } from '@/components/consents/ConsentFilters';
import ConsentStats from '@/components/consents/ConsentStats';
import ConsentTable from '@/components/consents/ConsentTable';
import ConsentPreview from '@/components/consents/ConsentPreview';
import ConsentAuditTrail from '@/components/consents/ConsentAuditTrail';
import ConsentStatusBadge from '@/components/consents/ConsentStatusBadge';
import DeliveryDialog from '@/components/consents/DeliveryDialog';
import type { DashboardConsentRow, DeliveryChannel, RequestStatus } from '@/lib/consents/types';
import {
  cancelConsent,
  countConsentsByStatus,
  listConsents,
  listTemplatesForFilter,
} from '@/lib/consents/request-service';
import { downloadSignedDocument } from '@/lib/consents/document-service';
import { effectiveStatus, type ConsentAction } from '@/lib/consents/status';
import { LINK_ISSUANCE_ENABLED } from '@/lib/delivery/readiness';
import { formatIsoToUsDate } from '@/utils/dateUtils';

const PAGE_SIZE = 25;

/**
 * Consents & Signatures — every consent across every client this agent owns.
 *
 * Scoping is RLS's job: signature_requests is only reachable through
 * clients.agent_id = auth.uid(). There is no agent filter in any query here and
 * there must never be one — a filter can be forgotten, a policy cannot.
 */
export default function ConsentsDashboardPage() {
  const router = useRouter();

  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<DashboardConsentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<RequestStatus, number> | null>(null);
  const [templates, setTemplates] = useState<Array<{ id: string; internal_name: string }>>([]);

  const [loading, setLoading] = useState(true);
  const [countsLoading, setCountsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [detail, setDetail] = useState<{ row: DashboardConsentRow; tab: 'document' | 'audit' } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<DashboardConsentRow | null>(null);
  const [delivery, setDelivery] = useState<{ row: DashboardConsentRow; channel: DeliveryChannel } | null>(null);

  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  const filtered = hasActiveFilters(filters);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 4000);
  };

  // Filters are serialised so the effect compares by value, not by object
  // identity — otherwise every render would refetch.
  const filterKey = useMemo(() => JSON.stringify(filters), [filters]);

  // ---- Template list (static for the session) ---------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listTemplatesForFilter();
        if (!cancelled) setTemplates(list);
      } catch {
        // A missing template filter is a cosmetic loss; the page still works.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Rows -------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    const timer = window.setTimeout(() => {
      (async () => {
        setLoading(true);
        setError(null);
        try {
          const result = await listConsents(JSON.parse(filterKey) as FilterState, page, PAGE_SIZE);
          if (cancelled) return;
          setRows(result.rows);
          setTotal(result.total);
        } catch (err) {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : 'Could not load consents.');
          setRows([]);
          setTotal(0);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [filterKey, page, reloadToken]);

  // ---- Counts -----------------------------------------------------------
  // Deliberately ignores `status`: the cards must keep showing every bucket even
  // while one of them is selected, otherwise selecting "Signed" would zero the
  // other six and there would be no way back.
  const countsKey = useMemo(() => {
    const { status: _status, ...rest } = filters;
    void _status;
    return JSON.stringify(rest);
  }, [filters]);

  useEffect(() => {
    let cancelled = false;

    const timer = window.setTimeout(() => {
      (async () => {
        setCountsLoading(true);
        try {
          const result = await countConsentsByStatus(JSON.parse(countsKey) as FilterState);
          if (!cancelled) setCounts(result);
        } catch {
          if (!cancelled) setCounts(null);
        } finally {
          if (!cancelled) setCountsLoading(false);
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [countsKey, reloadToken]);

  // Any filter change resets to page 1 — staying on page 4 of a narrower result
  // set shows an empty table and reads as a bug.
  const updateFilters = (next: FilterState) => {
    setFilters(next);
    setPage(1);
  };

  // ---- Actions ----------------------------------------------------------
  const handleAction = async (action: ConsentAction, row: DashboardConsentRow) => {
    switch (action) {
      case 'view':
      case 'preview':
        setDetail({ row, tab: 'document' });
        return;

      case 'audit_trail':
        setDetail({ row, tab: 'audit' });
        return;

      case 'continue_draft':
        // The wizard lives in the client profile, where the client's data is
        // already loaded. Sending the agent there beats duplicating it.
        router.push(`/clients/${row.client_id}?tab=consents&draft=${row.id}`);
        return;

      case 'cancel':
        setConfirmCancel(row);
        return;

      case 'send':
        setDelivery({ row, channel: 'email' });
        return;
      case 'whatsapp':
        setDelivery({ row, channel: 'whatsapp' });
        return;
      case 'sms':
        setDelivery({ row, channel: 'sms' });
        return;
      case 'copy_link':
        setDelivery({ row, channel: 'copy_link' });
        return;

      case 'download':
        await handleDownload(row);
        return;
    }
  };

  /**
   * Downloads the signed PDF through a short-lived signed URL.
   *
   * The bucket is private and stays private: the URL is minted per click and
   * expires in a minute. Nothing here ever exposes a storage path publicly.
   */
  const handleDownload = async (row: DashboardConsentRow) => {
    setBusyId(row.id);
    setError(null);
    try {
      const url = await downloadSignedDocument(row.id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download the document.');
    } finally {
      setBusyId(null);
    }
  };

  const runCancel = async (row: DashboardConsentRow) => {
    setBusyId(row.id);
    setError(null);
    try {
      await cancelConsent(row.id);
      flash(`"${row.title}" was cancelled.`);
      setConfirmCancel(null);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel the consent.');
    } finally {
      setBusyId(null);
    }
  };

  // ---- Detail panel -----------------------------------------------------
  if (detail) {
    const { row, tab } = detail;
    return (
      <DashboardLayout>
        <div className="space-y-4 max-w-4xl">
          <button
            type="button"
            onClick={() => setDetail(null)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
            </svg>
            Consents &amp; Signatures
          </button>

          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg font-extrabold text-slate-900">{row.title}</h1>
                  <ConsentStatusBadge status={effectiveStatus(row)} />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  <Link href={`/clients/${row.client_id}`} className="font-semibold hover:text-blue-600 hover:underline">
                    {row.client_name}
                  </Link>
                  {' · '}
                  {row.template_internal_name ?? 'Unknown template'}
                  {' · Created '}
                  {formatIsoToUsDate(row.created_at)}
                </p>
                {row.original_document_hash && (
                  <p className="text-[10px] text-slate-300 font-mono mt-1" title={row.original_document_hash}>
                    sha256 {row.original_document_hash.slice(0, 32)}…
                  </p>
                )}
              </div>

              <div className="flex bg-slate-50 border border-slate-200/60 p-1 rounded-xl gap-1">
                <TabButton active={tab === 'document'} onClick={() => setDetail({ row, tab: 'document' })}>
                  Document
                </TabButton>
                <TabButton active={tab === 'audit'} onClick={() => setDetail({ row, tab: 'audit' })}>
                  Audit Trail
                </TabButton>
              </div>
            </div>
          </div>

          {tab === 'document' ? (
            <ConsentPreview
              content={row.rendered_content}
              publicTitle={row.title}
              consentText={row.merge_data_snapshot?.rendered_consent_text ?? ''}
            />
          ) : (
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
              <ConsentAuditTrail requestId={row.id} />
            </div>
          )}
        </div>
      </DashboardLayout>
    );
  }

  // ---- Dashboard --------------------------------------------------------
  return (
    <DashboardLayout>
      <div className="space-y-5 max-w-[1600px]">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
              Consents &amp; Signatures
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Every consent across your clients.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/consents/templates"
              className="px-4 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-bold rounded-xl transition-colors"
            >
              Consent Templates
            </Link>
            <Link
              href="/clients"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors active:scale-[0.98]"
              title="Consents are created from a client's profile"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              New Consent
            </Link>
          </div>
        </div>

        {/* Only shown if this build is ever pointed at a database that predates
            the token-reissue migration. */}
        {!LINK_ISSUANCE_ENABLED && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-sm font-bold text-amber-800">Sending is not available</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Signing links cannot be issued until{' '}
              <code className="font-mono">migration_signatures_token_reissue.sql</code> is applied.
            </p>
          </div>
        )}

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

        <ConsentStats
          counts={counts}
          loading={countsLoading}
          activeStatus={filters.status}
          onSelect={(status) => updateFilters({ ...filters, status })}
        />

        <ConsentFilters
          value={filters}
          onChange={updateFilters}
          templates={templates}
          resultCount={total}
          loading={loading}
        />

        <ConsentTable
          rows={rows}
          loading={loading}
          busyId={busyId}
          filtered={filtered}
          onAction={handleAction}
          onClearFilters={() => updateFilters(EMPTY_FILTERS)}
          deliveryReady={LINK_ISSUANCE_ENABLED}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
        />
      </div>

      {delivery && (
        <DeliveryDialog
          row={delivery.row}
          channel={delivery.channel}
          onClose={() => setDelivery(null)}
          onDone={(message) => {
            setDelivery(null);
            flash(message);
            reload();
          }}
        />
      )}

      {/* Cancel confirmation — cancelling is irreversible, so it is never one click */}
      {confirmCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5">
            <h2 className="text-sm font-extrabold text-slate-900">Cancel this consent?</h2>
            <p className="text-xs text-slate-600 mt-2">
              &quot;{confirmCancel.title}&quot; for {confirmCancel.client_name} will be closed
              permanently. Any signing link stops working, and the consent cannot be reopened —
              you would have to create a new one.
            </p>
            <p className="text-xs text-slate-500 mt-2">
              The record and its history are kept.
            </p>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setConfirmCancel(null)}
                disabled={busyId === confirmCancel.id}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-xl transition-colors disabled:opacity-50"
              >
                Keep it
              </button>
              <button
                type="button"
                onClick={() => runCancel(confirmCancel)}
                disabled={busyId === confirmCancel.id}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-60"
              >
                {busyId === confirmCancel.id ? 'Cancelling…' : 'Cancel consent'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
        active ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
      }`}
    >
      {children}
    </button>
  );
}
