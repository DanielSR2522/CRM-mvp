'use client';

import React from 'react';
import Link from 'next/link';
import type { DashboardConsentRow } from '@/lib/consents/types';
import { channelLabel, effectiveStatus, type ConsentAction } from '@/lib/consents/status';
import { formatIsoToUsDate } from '@/utils/dateUtils';
import ConsentActionsMenu from './ConsentActionsMenu';
import ConsentStatusBadge from './ConsentStatusBadge';

interface ConsentTableProps {
  rows: DashboardConsentRow[];
  loading: boolean;
  busyId: string | null;
  filtered: boolean;
  onAction: (action: ConsentAction, row: DashboardConsentRow) => void;
  onClearFilters: () => void;
  deliveryReady?: boolean;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export default function ConsentTable({
  rows,
  loading,
  busyId,
  filtered,
  onAction,
  onClearFilters,
  deliveryReady = true,
  page,
  pageSize,
  total,
  onPageChange,
}: ConsentTableProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-slate-50 dark:bg-slate-800/50 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-12 shadow-xs text-center">
        <div className="w-12 h-12 mx-auto rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center mb-3">
          <svg className="w-6 h-6 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        {filtered ? (
          <>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">No consents match these filters</p>
            <button
              type="button"
              onClick={onClearFilters}
              className="mt-3 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline transition-colors"
            >
              Clear filters
            </button>
          </>
        ) : (
          <>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">No consents yet</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              Consents are created from a client&apos;s profile, where their details can be filled
              in automatically.
            </p>
            <Link
              href="/clients"
              className="inline-block mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors shadow-sm"
            >
              Go to Clients
            </Link>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
      {/* Desktop */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50">
              <Th>Client</Th>
              <Th>Title</Th>
              <Th>Template</Th>
              <Th>Status</Th>
              <Th>Created</Th>
              <Th>Sent</Th>
              <Th>Signed</Th>
              <Th>Channel</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors ${
                  busyId === row.id ? 'opacity-50' : ''
                }`}
              >
                <Td>
                  <Link
                    href={`/clients/${row.client_id}`}
                    className="font-extrabold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    {row.client_name ?? '—'}
                  </Link>
                </Td>
                <Td>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{row.title}</span>
                  {row.signer_name && row.signer_name !== row.client_name && (
                    <span className="block text-[10px] text-slate-400 mt-0.5 font-medium">
                      Signer: {row.signer_name}
                    </span>
                  )}
                </Td>
                <Td>
                  <span className="text-slate-700 dark:text-slate-300 font-medium">{row.template_internal_name ?? '—'}</span>
                </Td>
                <Td>
                  <ConsentStatusBadge status={effectiveStatus(row)} />
                </Td>
                <Td><span className="text-slate-500 dark:text-slate-400 font-medium">{formatIsoToUsDate(row.created_at)}</span></Td>
                <Td><span className="text-slate-500 dark:text-slate-400 font-medium">{row.sent_at ? formatIsoToUsDate(row.sent_at) : '—'}</span></Td>
                <Td><span className="text-slate-500 dark:text-slate-400 font-medium">{row.signed_at ? formatIsoToUsDate(row.signed_at) : '—'}</span></Td>
                <Td><span className="text-slate-700 dark:text-slate-300 font-medium">{channelLabel(row.selected_delivery_channel)}</span></Td>
                <Td align="right">
                  <ConsentActionsMenu
                    row={row}
                    onAction={onAction}
                    busy={busyId === row.id}
                    deliveryReady={deliveryReady}
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <div className="lg:hidden divide-y divide-slate-100 dark:divide-slate-800">
        {rows.map((row) => (
          <div key={row.id} className={`p-4 ${busyId === row.id ? 'opacity-50' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  href={`/clients/${row.client_id}`}
                  className="text-sm font-extrabold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 truncate block"
                >
                  {row.client_name ?? '—'}
                </Link>
                <p className="text-xs text-slate-600 dark:text-slate-300 truncate mt-0.5 font-bold">{row.title}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {row.template_internal_name ?? '—'}
                </p>
              </div>
              <ConsentStatusBadge status={effectiveStatus(row)} />
            </div>

            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <Meta label="Created" value={formatIsoToUsDate(row.created_at)} />
              <Meta label="Sent" value={row.sent_at ? formatIsoToUsDate(row.sent_at) : '—'} />
              <Meta label="Signed" value={row.signed_at ? formatIsoToUsDate(row.signed_at) : '—'} />
              <Meta label="Channel" value={channelLabel(row.selected_delivery_channel)} />
            </dl>

            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <ConsentActionsMenu
                row={row}
                onAction={onAction}
                busy={busyId === row.id}
                deliveryReady={deliveryReady}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            {from}–{to} of {total}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-xs text-slate-500 dark:text-slate-400 px-2 tabular-nums font-bold">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th
      className={`py-3.5 px-4 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 ${
        align === 'right' ? 'text-right' : ''
      }`}
    >
      {children}
    </th>
  );
}

function Td({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <td className={`py-3.5 px-4 align-middle ${align === 'right' ? 'text-right' : ''}`}>
      {children}
    </td>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="text-xs text-slate-700 dark:text-slate-300 font-semibold">{value}</dd>
    </div>
  );
}
