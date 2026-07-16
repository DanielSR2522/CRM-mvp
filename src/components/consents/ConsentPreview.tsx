'use client';

import React from 'react';
import type { TemplateBlock, TemplateContent, UnresolvedVariable } from '@/lib/consents/types';

/**
 * Renders a merged document — the real thing the client will read.
 *
 * The difference from TemplatePreview is what a token means. There, every
 * variable is a placeholder shown in blue. Here, resolved values are plain text
 * (because that is exactly how they will print), and only the tokens that failed
 * to resolve stay highlighted — in amber, as a warning, not as decoration.
 *
 * Like the template preview, this never uses dangerouslySetInnerHTML. Every
 * value passes through React text interpolation, so a client's own data cannot
 * become markup even if someone typed a <script> tag into a client record.
 */

const TOKEN_SPLIT = /(\{\{\s*[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?\s*\}\})/g;
const TOKEN_TEST = /^\{\{\s*[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?\s*\}\}$/;

/** Anything still looking like a token after the merge is an unfilled field. */
function renderText(text: string): React.ReactNode[] {
  return text.split(TOKEN_SPLIT).map((part, i) => {
    if (TOKEN_TEST.test(part)) {
      return (
        <span
          key={i}
          title="This field has no value and will print exactly like this."
          className="inline-block px-1.5 py-0.5 mx-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[0.9em] font-semibold"
        >
          {part.replace(/\s+/g, '')}
        </span>
      );
    }
    return part.split('\n').map((line, j, arr) => (
      <React.Fragment key={`${i}-${j}`}>
        {line}
        {j < arr.length - 1 && <br />}
      </React.Fragment>
    ));
  });
}

const SPACER_HEIGHT: Record<string, string> = { small: 'h-3', medium: 'h-6', large: 'h-12' };

function Block({ block }: { block: TemplateBlock }) {
  switch (block.type) {
    case 'heading': {
      const classes =
        block.level === 1
          ? 'text-2xl font-extrabold text-slate-900 tracking-tight'
          : block.level === 2
            ? 'text-lg font-bold text-slate-900'
            : 'text-sm font-bold text-slate-700 uppercase tracking-wide';
      return <p className={classes}>{renderText(block.text)}</p>;
    }
    case 'paragraph':
      return <p className="text-sm text-slate-700 leading-relaxed">{renderText(block.text)}</p>;
    case 'bullet_list':
      return (
        <ul className="list-disc pl-5 space-y-1.5">
          {block.items.map((item, i) => (
            <li key={i} className="text-sm text-slate-700 leading-relaxed">
              {renderText(item)}
            </li>
          ))}
        </ul>
      );
    case 'numbered_list':
      return (
        <ol className="list-decimal pl-5 space-y-1.5">
          {block.items.map((item, i) => (
            <li key={i} className="text-sm text-slate-700 leading-relaxed">
              {renderText(item)}
            </li>
          ))}
        </ol>
      );
    case 'divider':
      return <hr className="border-slate-200" />;
    case 'spacer':
      return <div className={SPACER_HEIGHT[block.size] ?? 'h-6'} aria-hidden="true" />;
    case 'consent':
      return (
        <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
          <div className="flex gap-3">
            <div className="mt-0.5 w-4 h-4 rounded border-2 border-blue-300 bg-white flex-shrink-0" aria-hidden="true" />
            <p className="text-sm text-slate-700 leading-relaxed">{renderText(block.text)}</p>
          </div>
        </div>
      );
    case 'signature_placeholder':
      return (
        <div className="pt-2">
          <div className="h-16 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/60 flex items-center justify-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Signature area
            </span>
          </div>
          <div className="border-t border-slate-300 mt-1 pt-1.5">
            <span className="text-xs font-semibold text-slate-500">{block.label}</span>
          </div>
        </div>
      );
    case 'date':
      return (
        <div className="pt-2 max-w-[220px]">
          <div className="h-8 border-b border-slate-300" />
          <span className="text-xs font-semibold text-slate-500">{block.label}</span>
        </div>
      );
    case 'footer':
      return (
        <p className="text-[11px] text-slate-400 leading-relaxed border-t border-slate-100 pt-3">
          {renderText(block.text)}
        </p>
      );
    default:
      return null;
  }
}

interface ConsentPreviewProps {
  content: TemplateContent;
  publicTitle: string;
  consentText: string;
  unresolved?: UnresolvedVariable[];
  bare?: boolean;
}

export default function ConsentPreview({
  content,
  publicTitle,
  consentText,
  unresolved = [],
  bare = false,
}: ConsentPreviewProps) {
  const blocks = content?.blocks ?? [];

  const body = (
    <div className="space-y-4">
      {unresolved.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-bold text-amber-800">
            {unresolved.length} field{unresolved.length === 1 ? '' : 's'} could not be filled
          </p>
          <p className="text-[11px] text-amber-700 mt-0.5">
            They are highlighted below and will print exactly as shown.
          </p>
        </div>
      )}

      {publicTitle.trim() && (
        <div className="pb-3 border-b border-slate-100">
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">{publicTitle}</h2>
        </div>
      )}

      {blocks.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-400">This document is empty.</p>
      ) : (
        blocks.map((block) => <Block key={block.id} block={block} />)
      )}

      {consentText.trim() && (
        <div className="mt-6 pt-4 border-t border-slate-100">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            Consent required before signing
          </p>
          <div className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <div className="mt-0.5 w-4 h-4 rounded border-2 border-slate-300 bg-white flex-shrink-0" aria-hidden="true" />
            <p className="text-xs text-slate-600 leading-relaxed">{renderText(consentText)}</p>
          </div>
        </div>
      )}
    </div>
  );

  if (bare) return body;

  return <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">{body}</div>;
}
