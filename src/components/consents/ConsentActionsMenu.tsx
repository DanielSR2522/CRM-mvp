'use client';

import React, { useState } from 'react';
import type { DashboardConsentRow } from '@/lib/consents/types';
import { availableActions, primaryAction, type ConsentAction } from '@/lib/consents/status';

/**
 * The per-row action menu.
 *
 * The status machine decides what is offered; this only draws it. Actions that
 * make no sense for a status never appear — a menu of eight dead options is
 * noise. Actions that fit but lack a precondition stay visible and disabled with
 * the reason on hover, so the agent learns what is missing rather than wondering
 * where the button went.
 */

interface ConsentActionsMenuProps {
  row: DashboardConsentRow;
  onAction: (action: ConsentAction, row: DashboardConsentRow) => void;
  busy?: boolean;
  /** False while the delivery layer cannot issue links. */
  deliveryReady?: boolean;
}

export default function ConsentActionsMenu({
  row,
  onAction,
  busy = false,
  deliveryReady = true,
}: ConsentActionsMenuProps) {
  const [open, setOpen] = useState(false);

  const actions = availableActions({
    request: row,
    signerEmail: row.signer_email,
    signerPhone: row.signer_phone,
    deliveryReady,
  });

  const primary = primaryAction({ request: row });
  const primaryItem = actions.find((a) => a.action === primary);
  const secondary = actions.filter((a) => a.action !== primary);

  const run = (action: ConsentAction) => {
    setOpen(false);
    onAction(action, row);
  };

  return (
    <div className="inline-flex items-center gap-1.5">
      {primaryItem && (
        <button
          type="button"
          onClick={() => run(primaryItem.action)}
          disabled={busy || !primaryItem.enabled}
          title={primaryItem.reason}
          className="px-2.5 py-1 border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 text-slate-600 hover:text-blue-700 text-[10px] font-bold rounded-lg transition-all disabled:opacity-40"
        >
          {primaryItem.label}
        </button>
      )}

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={busy}
          aria-label="More actions"
          aria-expanded={open}
          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
            <div className="absolute right-0 z-20 mt-1 w-52 bg-white border border-slate-200 rounded-xl shadow-lg py-1">
              {secondary.map((item, i) => {
                const prevDestructive = secondary[i - 1]?.destructive;
                const needsDivider = item.destructive && !prevDestructive && i > 0;

                return (
                  <React.Fragment key={item.action}>
                    {needsDivider && <div className="my-1 border-t border-slate-100" />}
                    <button
                      type="button"
                      onClick={() => run(item.action)}
                      disabled={!item.enabled}
                      title={item.reason}
                      className={`w-full text-left px-3 py-2 text-xs font-semibold transition-colors focus:outline-none focus:bg-slate-50 disabled:cursor-not-allowed ${
                        item.destructive
                          ? 'text-rose-600 hover:bg-rose-50 disabled:text-rose-300'
                          : 'text-slate-700 hover:bg-slate-50 disabled:text-slate-300'
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        {item.label}
                        {!item.enabled && (
                          <svg className="w-3 h-3 flex-shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                            />
                          </svg>
                        )}
                      </span>
                      {!item.enabled && item.reason && (
                        <span className="block text-[9px] font-medium text-slate-400 mt-0.5 leading-tight">
                          {item.reason}
                        </span>
                      )}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
