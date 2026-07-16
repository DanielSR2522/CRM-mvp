'use client';

import React from 'react';
import type { ConsentTemplateVersion } from '@/lib/consents/types';

/**
 * Read-only list of published versions.
 *
 * Versions are frozen once a signature request references them, so this is an
 * audit view, not an editor. The content hash is shown truncated because it is
 * what proves a given version was never altered — an agent may need to read it
 * out to a carrier or a lawyer.
 */

interface TemplateVersionHistoryProps {
  versions: ConsentTemplateVersion[];
  currentVersion: number;
  loading: boolean;
  onPreview?: (version: ConsentTemplateVersion) => void;
  previewingId?: string | null;
}

export default function TemplateVersionHistory({
  versions,
  currentVersion,
  loading,
  onPreview,
  previewingId,
}: TemplateVersionHistoryProps) {
  if (loading) {
    return (
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
        <div className="h-4 bg-slate-100 rounded w-32 animate-pulse" />
        <div className="h-3 bg-slate-50 rounded w-full mt-3 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-50">
        <h3 className="text-sm font-extrabold text-slate-900">Version history</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Published versions are frozen once used by a consent.
        </p>
      </div>

      {versions.length === 0 ? (
        <p className="px-4 py-6 text-xs text-slate-400 text-center">No versions yet.</p>
      ) : (
        <ul className="divide-y divide-slate-50">
          {versions.map((version) => {
            const isCurrent = version.version_number === currentVersion;
            const isPreviewing = previewingId === version.id;

            return (
              <li
                key={version.id}
                className={`px-4 py-3 transition-colors ${isPreviewing ? 'bg-blue-50/50' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-extrabold text-slate-900">
                      v{version.version_number}
                    </span>
                    {isCurrent && (
                      <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 text-[9px] font-bold uppercase tracking-wider">
                        Current
                      </span>
                    )}
                  </div>

                  {onPreview && (
                    <button
                      type="button"
                      onClick={() => onPreview(version)}
                      className="text-[10px] font-bold text-blue-600 hover:text-blue-800 transition-colors focus:outline-none focus:underline"
                    >
                      {isPreviewing ? 'Previewing' : 'Preview'}
                    </button>
                  )}
                </div>

                <p className="text-[10px] text-slate-400 mt-1">
                  {formatTimestamp(version.created_at)}
                  {version.variables_used.length > 0 &&
                    ` · ${version.variables_used.length} variable${version.variables_used.length === 1 ? '' : 's'}`}
                </p>

                {version.content_hash && (
                  <p
                    className="text-[9px] text-slate-300 font-mono mt-0.5 truncate"
                    title={version.content_hash}
                  >
                    sha256 {version.content_hash.slice(0, 16)}…
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Local time, MM/DD/YYYY plus clock — matches how the timeline reads elsewhere. */
function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
