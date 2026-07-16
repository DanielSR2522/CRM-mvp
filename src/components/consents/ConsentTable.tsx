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
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-slate-50 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-slate-100 rounded-2xl p-10 shadow-sm text-center">
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
        {filtered ? (
          <>
            <p className="text-sm font-bold text-slate-700">No consents match these filters</p>
            <button
              type="button"
              onClick={onClearFilters}
              className="mt-3 text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
            >
              Clear filters
            </button>
          </>
        ) : (
          <>
            <p className="text-sm font-bold text-slate-700">No consents yet</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Consents are created from a client&apos;s profile, where their details can be filled
              in automatically.
            </p>
            <Link
              href="/clients"
              className="inline-block mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors"
            >
              Go to Clients
            </Link>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
      {/* Desktop */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
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
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`border-b border-slate-50 hover:bg-slate-50/50 transition-colors ${
                  busyId === row.id ? 'opacity-50' : ''
                }`}
              >
                <Td>
                  <Link
                    href={`/clients/${row.client_id}`}
                    className="font-bold text-slate-800 hover:text-blue-600 hover:underline"
                  >
                    {row.client_name ?? '—'}
                  </Link>
                </Td>
                <Td>
                  <span className="font-semibold text-slate-700">{row.title}</span>
                  {row.signer_name && row.signer_name !== row.client_name && (
                    <span className="block text-[10px] text-slate-400 mt-0.5">
                      Signer: {row.signer_name}
                    </span>
                  )}
                </Td>
                <Td>{row.template_internal_name ?? '—'}</Td>
                <Td>
                  {/*
                    effectiveStatus, not row.status: a request past its expiry is
                    expired whether or not a write has caught up. Showing "sent"
                    for a dead link would be a lie.
                  */}
                  <ConsentStatusBadge status={effectiveStatus(row)} />
                </Td>
                <Td>{formatIsoToUsDate(row.created_at)}</Td>
                <Td>{row.sent_at ? formatIsoToUsDate(row.sent_at) : '—'}</Td>
                <Td>{row.signed_at ? formatIsoToUsDate(row.signed_at) : '—'}</Td>
                <Td>{channelLabel(row.selected_delivery_channel)}</Td>
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
      <div className="lg:hidden divide-y divide-slate-50">
        {rows.map((row) => (
          <div key={row.id} className={`p-4 ${busyId === row.id ? 'opacity-50' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  href={`/clients/${row.client_id}`}
                  className="text-sm font-bold text-slate-800 hover:text-blue-600 truncate block"
                >
                  {row.client_name ?? '—'}
                </Link>
                <p className="text-xs text-slate-500 truncate mt-0.5">{row.title}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {row.template_internal_name ?? '—'}
                </p>
              </div>
              <ConsentStatusBadge status={effectiveStatus(row)} />
            </div>

            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 mt-3 pt-3 border-t border-slate-50">
              <Meta label="Created" value={formatIsoToUsDate(row.created_at)} />
              <Meta label="Sent" value={row.sent_at ? formatIsoToUsDate(row.sent_at) : '—'} />
              <Meta label="Signed" value={row.signed_at ? formatIsoToUsDate(row.signed_at) : '—'} />
              <Meta label="Channel" value={channelLabel(row.selected_delivery_channel)} />
            </dl>

            <div className="mt-3 pt-3 border-t border-slate-50 flex justify-end">
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
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-50 bg-slate-50/30">
          <span className="text-xs text-slate-500">
            {from}–{to} of {total}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="px-3 py-1.5 border border-slate-200 hover:bg-white text-slate-600 text-xs font-bold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-xs text-slate-500 px-2 tabular-nums">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="px-3 py-1.5 border border-slate-200 hover:bg-white text-slate-600 text-xs font-bold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
      className={`py-2.5 px-3 text-[9px] font-bold uppercase tracking-wider text-slate-400 ${
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

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="text-xs text-slate-600 font-semibold">{value}</dd>
    </div>
  );
}
