'use client';

import React, { useState } from 'react';
import { VARIABLE_GROUPS } from '@/lib/consents/types';

/**
 * Inserts {{variable}} tokens into whichever field is focused.
 *
 * V1 only lists variables with a confirmed real column behind them. Anything the
 * inspection could not trace to an actual column — first/middle/last name, state,
 * agency contact details, agent fields — is deliberately absent rather than
 * guessed at. The `source` line tells the agent exactly where each value will
 * come from, so nobody has to trust the label.
 *
 * This phase only inserts the token. Replacing it with real client data is Phase 4.
 */

interface VariablePickerProps {
  /** Called with the token text, e.g. "{{client.full_name}}". */
  onInsert: (token: string) => void;
  /** Set when no text field is focused — inserting would have nowhere to go. */
  disabled?: boolean;
  disabledReason?: string;
}

export default function VariablePicker({
  onInsert,
  disabled = false,
  disabledReason,
}: VariablePickerProps) {
  const [openGroup, setOpenGroup] = useState<string | null>('client');
  const [justInserted, setJustInserted] = useState<string | null>(null);

  const handleInsert = (token: string) => {
    if (disabled) return;
    onInsert(`{{${token}}}`);
    setJustInserted(token);
    window.setTimeout(() => setJustInserted(null), 1200);
  };

  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-50">
        <h3 className="text-sm font-extrabold text-slate-900">Variables</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          {disabled
            ? disabledReason || 'Click into a text field first.'
            : 'Click to insert at the cursor.'}
        </p>
      </div>

      <div className="divide-y divide-slate-50 max-h-[420px] overflow-y-auto">
        {VARIABLE_GROUPS.map((group) => {
          const isOpen = openGroup === group.key;
          return (
            <div key={group.key}>
              <button
                type="button"
                onClick={() => setOpenGroup(isOpen ? null : group.key)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                aria-expanded={isOpen}
              >
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  {group.label}
                </span>
                <svg
                  className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isOpen && (
                <div className="pb-2">
                  {group.variables.map((variable) => (
                    <button
                      key={variable.token}
                      type="button"
                      // onMouseDown, not onClick: onClick fires after the textarea
                      // has already lost focus, which loses the cursor position we
                      // need to insert at.
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleInsert(variable.token);
                      }}
                      disabled={disabled}
                      title={`Source: ${variable.source}`}
                      className={`w-full text-left px-4 py-2 transition-colors group ${
                        disabled
                          ? 'opacity-40 cursor-not-allowed'
                          : 'hover:bg-blue-50/60 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-700 group-hover:text-blue-700">
                          {variable.label}
                        </span>
                        {justInserted === variable.token && (
                          <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">
                            Inserted
                          </span>
                        )}
                      </div>
                      <code className="block text-[10px] text-slate-400 font-mono mt-0.5 truncate">
                        {`{{${variable.token}}}`}
                      </code>
                      <span className="block text-[10px] text-slate-400 mt-0.5 truncate">
                        e.g. {variable.example}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-4 py-3 bg-slate-50/60 border-t border-slate-50">
        <p className="text-[10px] text-slate-400 leading-relaxed">
          Only variables backed by a real column are listed. Values are filled in when a
          consent is created from this template.
        </p>
      </div>
    </div>
  );
}
