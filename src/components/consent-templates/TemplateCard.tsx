'use client';

import React, { useState } from 'react';
import type { ConsentTemplate } from '@/lib/consents/types';
import { LANGUAGE_LABELS } from '@/lib/consents/types';
import { formatIsoToUsDate } from '@/utils/dateUtils';
import TemplateStatusBadge from './TemplateStatusBadge';

/**
 * One row in the template list. Selection drives the preview panel on the right,
 * so the whole card is the click target and actions live behind a menu to keep
 * secondary options out of the way.
 */

export interface TemplateCardActions {
  onEdit: (template: ConsentTemplate) => void;
  onDuplicate: (template: ConsentTemplate) => void;
  onActivate: (template: ConsentTemplate) => void;
  onDeactivate: (template: ConsentTemplate) => void;
  onArchive: (template: ConsentTemplate) => void;
}

interface TemplateCardProps extends TemplateCardActions {
  template: ConsentTemplate;
  selected: boolean;
  onSelect: (template: ConsentTemplate) => void;
  busy?: boolean;
}

export default function TemplateCard({
  template,
  selected,
  onSelect,
  onEdit,
  onDuplicate,
  onActivate,
  onDeactivate,
  onArchive,
  busy = false,
}: TemplateCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isArchived = template.status === 'archived';

  const runAction = (action: () => void) => {
    setMenuOpen(false);
    action();
  };

  return (
    <div
      onClick={() => onSelect(template)}
      className={`relative bg-white border rounded-2xl p-4 shadow-sm transition-all cursor-pointer ${
        selected
          ? 'border-blue-300 ring-2 ring-blue-500/15'
          : 'border-slate-100 hover:border-slate-200'
      } ${isArchived ? 'opacity-60' : ''} ${busy ? 'pointer-events-none opacity-50' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-extrabold text-slate-900 truncate">{template.internal_name}</h3>
            <TemplateStatusBadge status={template.status} />
          </div>
          <p className="text-xs text-slate-500 mt-1 truncate">{template.public_title}</p>
          {template.description && (
            <p className="text-xs text-slate-400 mt-1 line-clamp-2">{template.description}</p>
          )}
        </div>

        {/* Actions menu */}
        <div className="relative flex-shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            aria-label="Template actions"
            aria-expanded={menuOpen}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
          </button>

          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                }}
                aria-hidden="true"
              />
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 z-20 mt-1 w-44 bg-white border border-slate-200 rounded-xl shadow-lg py-1"
              >
                <MenuItem onClick={() => runAction(() => onEdit(template))}>Edit</MenuItem>
                <MenuItem onClick={() => runAction(() => onDuplicate(template))}>Duplicate</MenuItem>

                {/* Status transitions depend on where the template currently is. */}
                {template.status !== 'active' && !isArchived && (
                  <MenuItem onClick={() => runAction(() => onActivate(template))}>Activate</MenuItem>
                )}
                {template.status === 'active' && (
                  <MenuItem onClick={() => runAction(() => onDeactivate(template))}>Deactivate</MenuItem>
                )}
                {isArchived && (
                  <MenuItem onClick={() => runAction(() => onDeactivate(template))}>Restore as inactive</MenuItem>
                )}

                {!isArchived && (
                  <>
                    <div className="my-1 border-t border-slate-100" />
                    <MenuItem danger onClick={() => runAction(() => onArchive(template))}>
                      Archive
                    </MenuItem>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Metadata strip */}
      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-50 flex-wrap">
        <Meta label="Language" value={LANGUAGE_LABELS[template.language] ?? template.language} />
        <Meta label="Version" value={`v${template.current_version}`} />
        <Meta
          label="Uses"
          value={String(template.usage_count)}
          highlight={template.usage_count > 0}
        />
        <Meta label="Updated" value={formatIsoToUsDate(template.updated_at)} />
      </div>
    </div>
  );
}

function Meta({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <span className={`text-xs font-semibold ${highlight ? 'text-blue-600' : 'text-slate-600'}`}>
        {value}
      </span>
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-2 text-xs font-semibold transition-colors focus:outline-none focus:bg-slate-50 ${
        danger ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  );
}
