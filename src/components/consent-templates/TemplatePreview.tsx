'use client';

import React from 'react';
import type { TemplateBlock, TemplateContent } from '@/lib/consents/types';

/**
 * Renders block JSON as the signer will eventually see it.
 *
 * Every value goes through React's text interpolation, never dangerouslySetInnerHTML.
 * That is the whole point of storing structured blocks instead of HTML: a template
 * body physically cannot carry a script, an iframe or an event handler, because
 * nothing here ever parses its text as markup.
 *
 * Variables are shown as tokens. Phase 4 replaces them with real client data; this
 * phase only proves the document reads correctly around them.
 */

const VARIABLE_SPLIT = /(\{\{\s*[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?\s*\}\})/g;

/** Highlights {{tokens}} inline so the agent can see where the merge will land. */
function renderText(text: string): React.ReactNode[] {
  return text.split(VARIABLE_SPLIT).map((part, i) => {
    if (VARIABLE_SPLIT.test(part)) {
      // .test advances lastIndex on a global regex; reset before reuse.
      VARIABLE_SPLIT.lastIndex = 0;
      return (
        <span
          key={i}
          className="inline-block px-1.5 py-0.5 mx-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100 text-[0.9em] font-semibold"
        >
          {part.replace(/\s+/g, '')}
        </span>
      );
    }
    VARIABLE_SPLIT.lastIndex = 0;
    // Preserve author-entered line breaks without introducing markup.
    return part.split('\n').map((line, j, arr) => (
      <React.Fragment key={`${i}-${j}`}>
        {line}
        {j < arr.length - 1 && <br />}
      </React.Fragment>
    ));
  });
}

const SPACER_HEIGHT: Record<string, string> = {
  small: 'h-3',
  medium: 'h-6',
  large: 'h-12',
};

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

interface TemplatePreviewProps {
  content: TemplateContent;
  publicTitle: string;
  consentText: string;
  /** Hides the chrome so the same component can render inside a modal or a card. */
  bare?: boolean;
}

export default function TemplatePreview({
  content,
  publicTitle,
  consentText,
  bare = false,
}: TemplatePreviewProps) {
  const blocks = content?.blocks ?? [];

  const body = (
    <div className="space-y-4">
      {publicTitle.trim() && (
        <div className="pb-3 border-b border-slate-100">
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">{publicTitle}</h2>
        </div>
      )}

      {blocks.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-slate-400">Nothing to preview yet.</p>
          <p className="text-xs text-slate-400 mt-1">Add a block to see the document take shape.</p>
        </div>
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
