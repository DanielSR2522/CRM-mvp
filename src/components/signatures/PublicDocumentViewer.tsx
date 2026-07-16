'use client';

import React from 'react';
import type { TemplateBlock, TemplateContent } from '@/lib/consents/types';

/**
 * The document, as the signer reads it.
 *
 * Everything goes through React text interpolation — no dangerouslySetInnerHTML,
 * anywhere. That is the payoff for storing structured blocks: a template body
 * physically cannot carry a script, so a public, unauthenticated page can render
 * agent-authored content without a sanitiser in the loop.
 *
 * Any {{token}} still visible here is a field that had no value. It stays plain
 * text rather than being hidden — a blank gap would quietly change the meaning of
 * a sentence someone is about to sign.
 */

const SPACER_HEIGHT: Record<string, string> = { small: 'h-3', medium: 'h-6', large: 'h-12' };

function renderText(text: string): React.ReactNode {
  return text.split('\n').map((line, i, arr) => (
    <React.Fragment key={i}>
      {line}
      {i < arr.length - 1 && <br />}
    </React.Fragment>
  ));
}

function Block({ block }: { block: TemplateBlock }) {
  switch (block.type) {
    case 'heading': {
      const classes =
        block.level === 1
          ? 'text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight'
          : block.level === 2
            ? 'text-base sm:text-lg font-bold text-slate-900'
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
        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
          <p className="text-sm text-slate-700 leading-relaxed">{renderText(block.text)}</p>
        </div>
      );
    case 'signature_placeholder':
    case 'date':
      // The real signature panel below replaces these. Drawing an empty box here
      // would suggest there is somewhere else to sign.
      return null;
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

export default function PublicDocumentViewer({
  content,
  title,
}: {
  content: TemplateContent;
  title: string;
}) {
  const blocks = content?.blocks ?? [];

  return (
    <article className="space-y-4">
      <div className="pb-4 border-b border-slate-100">
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">{title}</h1>
      </div>

      {blocks.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">This document has no content.</p>
      ) : (
        blocks.map((block) => <Block key={block.id} block={block} />)
      )}
    </article>
  );
}
