'use client';

import React from 'react';
import type { TemplateBlock, TemplateContent } from '@/lib/consents/types';

interface PublicDocumentViewerProps {
  content: TemplateContent;
  title: string;
  fieldResponses?: Record<string, any>;
  onFieldResponseChange?: (elementId: string, value: any) => void;
  readOnly?: boolean;
}

const SPACER_HEIGHT: Record<string, string> = { small: 'h-3', medium: 'h-6', large: 'h-12' };

function renderText(text: string): React.ReactNode {
  if (!text) return null;
  return text.split('\n').map((line, i, arr) => (
    <React.Fragment key={i}>
      {line}
      {i < arr.length - 1 && <br />}
    </React.Fragment>
  ));
}

function Block({
  block,
  fieldResponses = {},
  onFieldResponseChange,
  readOnly = false,
}: {
  block: TemplateBlock;
  fieldResponses?: Record<string, any>;
  onFieldResponseChange?: (elementId: string, value: any) => void;
  readOnly?: boolean;
}) {
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
          {(block.items || []).map((item, i) => (
            <li key={i} className="text-sm text-slate-700 leading-relaxed">
              {renderText(item)}
            </li>
          ))}
        </ul>
      );
    case 'numbered_list':
      return (
        <ol className="list-decimal pl-5 space-y-1.5">
          {(block.items || []).map((item, i) => (
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
    case 'image': {
      const alignClass =
        block.alignment === 'left' ? 'text-left' : block.alignment === 'right' ? 'text-right' : 'text-center';
      const sizeClass =
        block.size === 'small' ? 'max-w-[25%]' : block.size === 'large' ? 'max-w-[90%]' : block.size === 'full' ? 'w-full' : 'max-w-[60%]';

      return (
        <div className={`my-4 ${alignClass}`}>
          {block.url ? (
            <img
              src={block.url}
              alt={block.alt_text || 'Consent image'}
              className={`inline-block rounded-xl border border-slate-200/80 shadow-xs ${sizeClass}`}
            />
          ) : (
            <div className="inline-block p-4 border border-slate-200 rounded-xl bg-slate-50 text-xs text-slate-400 italic">
              Image placeholder
            </div>
          )}
          {block.caption && (
            <p className="text-xs text-slate-500 mt-1.5 italic">{block.caption}</p>
          )}
        </div>
      );
    }
    case 'checkbox': {
      const isChecked = fieldResponses[block.id] === true;
      return (
        <div className="my-3 p-4 rounded-xl border border-slate-200 bg-slate-50/80 space-y-1 font-sans">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isChecked}
              disabled={readOnly}
              onChange={(e) => onFieldResponseChange?.(block.id, e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-blue-600 rounded flex-shrink-0 cursor-pointer"
            />
            <div>
              <span className="text-xs font-bold text-slate-900 leading-snug">
                {block.label}
                {block.required !== false && <span className="text-rose-500 font-semibold ml-1.5">*Required</span>}
              </span>
              {block.description && <p className="text-[11px] text-slate-500 mt-0.5">{block.description}</p>}
            </div>
          </label>
        </div>
      );
    }
    case 'yes_no': {
      const currentVal = fieldResponses[block.id];
      const yesLabel = block.yes_label || 'Yes';
      const noLabel = block.no_label || 'No';

      return (
        <div className="my-3 p-4 rounded-xl border border-slate-200 bg-slate-50/80 space-y-2 font-sans">
          <div className="text-xs font-bold text-slate-900">
            {block.question}
            {block.required !== false && <span className="text-rose-500 font-semibold ml-1.5">*Required</span>}
          </div>
          <div className="flex flex-wrap items-center gap-5 text-xs font-semibold text-slate-800 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={`yes_no_${block.id}`}
                value="yes"
                checked={currentVal === 'yes'}
                disabled={readOnly}
                onChange={() => onFieldResponseChange?.(block.id, 'yes')}
                className="w-4 h-4 accent-blue-600 cursor-pointer"
              />
              <span>{yesLabel}</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={`yes_no_${block.id}`}
                value="no"
                checked={currentVal === 'no'}
                disabled={readOnly}
                onChange={() => onFieldResponseChange?.(block.id, 'no')}
                className="w-4 h-4 accent-blue-600 cursor-pointer"
              />
              <span>{noLabel}</span>
            </label>
          </div>
        </div>
      );
    }
    case 'initials': {
      const currentVal = fieldResponses[block.id] || '';
      return (
        <div className="my-3 p-4 rounded-xl border border-slate-200 bg-slate-50/80 space-y-2 font-sans">
          <label className="block text-xs font-bold text-slate-900">
            {block.label}
            {block.required !== false && <span className="text-rose-500 font-semibold ml-1.5">*Required</span>}
          </label>
          <input
            type="text"
            maxLength={10}
            value={currentVal}
            disabled={readOnly}
            onChange={(e) => onFieldResponseChange?.(block.id, e.target.value.toUpperCase())}
            placeholder="Signer Initials (e.g. JD)"
            className="w-36 uppercase text-xs font-extrabold text-slate-800 bg-white border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2 outline-none tracking-widest shadow-2xs"
          />
        </div>
      );
    }
    case 'signature_placeholder':
    case 'date':
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
  fieldResponses = {},
  onFieldResponseChange,
  readOnly = false,
}: PublicDocumentViewerProps) {
  const blocks = content?.blocks ?? [];

  // Parse HTML string if blocks are empty but HTML is available
  const hasHtml = Boolean(!blocks.length && content?.html);

  return (
    <article className="space-y-4 font-sans">
      <div className="pb-4 border-b border-slate-100">
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">{title}</h1>
      </div>

      {blocks.length > 0 ? (
        blocks.map((block) => (
          <Block
            key={block.id}
            block={block}
            fieldResponses={fieldResponses}
            onFieldResponseChange={onFieldResponseChange}
            readOnly={readOnly}
          />
        ))
      ) : hasHtml ? (
        <div
          className="prose prose-slate max-w-none text-sm text-slate-800 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: content.html || '' }}
        />
      ) : (
        <p className="py-8 text-center text-sm text-slate-400">This document has no content.</p>
      )}
    </article>
  );
}
