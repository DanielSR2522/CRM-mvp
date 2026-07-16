'use client';

import React, { useCallback, useRef, useState } from 'react';
import type { BlockType, HeadingLevel, TemplateBlock, TemplateContent } from '@/lib/consents/types';
import { BLOCK_LABELS, BLOCK_TYPES } from '@/lib/consents/types';
import {
  addBlock,
  addListItem,
  changeBlockType,
  duplicateBlock,
  isListBlock,
  isTextBlock,
  moveBlock,
  removeBlock,
  removeListItem,
  updateBlock,
  updateListItem,
} from '@/lib/consents/template-blocks';
import { issuesForBlock, type ValidationIssue } from '@/lib/consents/validation';

/**
 * Block editor over structured JSON.
 *
 * The parent owns the content; this component is controlled. It exposes an
 * imperative insertVariable through a ref-like callback so VariablePicker can
 * drop a token at the caret of whichever field was last focused.
 */

export interface TemplateEditorHandle {
  insertAtCursor: (token: string) => void;
  hasFocusTarget: boolean;
}

interface TemplateEditorProps {
  content: TemplateContent;
  onChange: (content: TemplateContent) => void;
  issues: ValidationIssue[];
  /** Receives an insert function the parent can hand to VariablePicker. */
  onRegisterInsert?: (insert: (token: string) => void) => void;
  onFocusTargetChange?: (hasTarget: boolean) => void;
  disabled?: boolean;
}

/** Identifies the field the caret is in, since a block can have many fields. */
interface FocusTarget {
  blockId: string;
  /** undefined for single-text blocks; the item index for list blocks. */
  itemIndex?: number;
}

export default function TemplateEditor({
  content,
  onChange,
  issues,
  onRegisterInsert,
  onFocusTargetChange,
  disabled = false,
}: TemplateEditorProps) {
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  // Keyed by "blockId" or "blockId:itemIndex" so we can read selectionStart.
  const fieldRefs = useRef<Map<string, HTMLTextAreaElement | HTMLInputElement>>(new Map());

  const blocks = content.blocks;

  const setBlocks = useCallback(
    (next: TemplateBlock[]) => onChange({ blocks: next }),
    [onChange]
  );

  const fieldKey = (t: FocusTarget) =>
    t.itemIndex === undefined ? t.blockId : `${t.blockId}:${t.itemIndex}`;

  /**
   * Inserts a token at the caret of the focused field, replacing any selection.
   * Falls back to appending if the element is gone.
   */
  const insertAtCursor = useCallback(
    (token: string) => {
      if (!focusTarget || disabled) return;

      const el = fieldRefs.current.get(fieldKey(focusTarget));
      const block = blocks.find((b) => b.id === focusTarget.blockId);
      if (!block) return;

      const currentValue =
        focusTarget.itemIndex !== undefined && isListBlock(block)
          ? block.items[focusTarget.itemIndex] ?? ''
          : isTextBlock(block)
            ? block.text
            : '';

      const start = el?.selectionStart ?? currentValue.length;
      const end = el?.selectionEnd ?? currentValue.length;
      const nextValue = currentValue.slice(0, start) + token + currentValue.slice(end);

      if (focusTarget.itemIndex !== undefined) {
        setBlocks(updateListItem(blocks, focusTarget.blockId, focusTarget.itemIndex, nextValue));
      } else {
        setBlocks(updateBlock(blocks, focusTarget.blockId, { text: nextValue } as Partial<TemplateBlock>));
      }

      // Put the caret after the inserted token once React has re-rendered.
      window.setTimeout(() => {
        const target = fieldRefs.current.get(fieldKey(focusTarget));
        if (target) {
          const pos = start + token.length;
          target.focus();
          target.setSelectionRange(pos, pos);
        }
      }, 0);
    },
    [blocks, focusTarget, disabled, setBlocks]
  );

  // Hand the insert function up so VariablePicker can call it.
  React.useEffect(() => {
    onRegisterInsert?.(insertAtCursor);
  }, [insertAtCursor, onRegisterInsert]);

  React.useEffect(() => {
    onFocusTargetChange?.(focusTarget !== null);
  }, [focusTarget, onFocusTargetChange]);

  const registerRef = (key: string) => (el: HTMLTextAreaElement | HTMLInputElement | null) => {
    if (el) fieldRefs.current.set(key, el);
    else fieldRefs.current.delete(key);
  };

  const handleAdd = (type: BlockType) => {
    setBlocks(addBlock(blocks, type));
    setAddMenuOpen(false);
  };

  return (
    <div className="space-y-3">
      {blocks.length === 0 && (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center">
          <p className="text-sm font-semibold text-slate-500">This template is empty</p>
          <p className="text-xs text-slate-400 mt-1">Add a block below to get started.</p>
        </div>
      )}

      {blocks.map((block, index) => {
        const blockIssues = issuesForBlock(issues, block.id);
        const hasError = blockIssues.length > 0;

        return (
          <div
            key={block.id}
            className={`bg-white border rounded-2xl shadow-sm transition-colors ${
              hasError ? 'border-rose-200' : 'border-slate-100'
            }`}
          >
            {/* Block toolbar */}
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-50">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] font-bold text-slate-400 tabular-nums w-5">
                  {index + 1}
                </span>
                <select
                  value={block.type}
                  onChange={(e) => setBlocks(changeBlockType(blocks, block.id, e.target.value as BlockType))}
                  disabled={disabled}
                  aria-label="Block type"
                  className="text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {BLOCK_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {BLOCK_LABELS[t]}
                    </option>
                  ))}
                </select>

                {block.type === 'heading' && (
                  <select
                    value={block.level}
                    onChange={(e) =>
                      setBlocks(
                        updateBlock(blocks, block.id, {
                          level: Number(e.target.value) as HeadingLevel,
                        } as Partial<TemplateBlock>)
                      )
                    }
                    disabled={disabled}
                    aria-label="Heading level"
                    className="text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    <option value={1}>H1</option>
                    <option value={2}>H2</option>
                    <option value={3}>H3</option>
                  </select>
                )}

                {block.type === 'spacer' && (
                  <select
                    value={block.size}
                    onChange={(e) =>
                      setBlocks(
                        updateBlock(blocks, block.id, { size: e.target.value } as Partial<TemplateBlock>)
                      )
                    }
                    disabled={disabled}
                    aria-label="Spacer size"
                    className="text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                  </select>
                )}
              </div>

              <div className="flex items-center gap-0.5 flex-shrink-0">
                <IconButton
                  label="Move up"
                  disabled={disabled || index === 0}
                  onClick={() => setBlocks(moveBlock(blocks, block.id, 'up'))}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                </IconButton>
                <IconButton
                  label="Move down"
                  disabled={disabled || index === blocks.length - 1}
                  onClick={() => setBlocks(moveBlock(blocks, block.id, 'down'))}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </IconButton>
                <IconButton
                  label="Duplicate block"
                  disabled={disabled}
                  onClick={() => setBlocks(duplicateBlock(blocks, block.id))}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </IconButton>
                <IconButton
                  label="Delete block"
                  danger
                  disabled={disabled}
                  onClick={() => setBlocks(removeBlock(blocks, block.id))}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </IconButton>
              </div>
            </div>

            {/* Block body */}
            <div className="p-3">
              {isTextBlock(block) && (
                <textarea
                  ref={registerRef(block.id)}
                  value={block.text}
                  onChange={(e) =>
                    setBlocks(updateBlock(blocks, block.id, { text: e.target.value } as Partial<TemplateBlock>))
                  }
                  onFocus={() => setFocusTarget({ blockId: block.id })}
                  disabled={disabled}
                  rows={block.type === 'heading' ? 1 : 3}
                  placeholder={placeholderFor(block.type)}
                  className="w-full text-sm text-slate-800 border border-slate-200 rounded-xl px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-50 disabled:opacity-60"
                />
              )}

              {isListBlock(block) && (
                <div className="space-y-2">
                  {block.items.map((item, itemIndex) => (
                    <div key={itemIndex} className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 w-4 flex-shrink-0">
                        {block.type === 'numbered_list' ? `${itemIndex + 1}.` : '•'}
                      </span>
                      <input
                        ref={registerRef(`${block.id}:${itemIndex}`)}
                        value={item}
                        onChange={(e) => setBlocks(updateListItem(blocks, block.id, itemIndex, e.target.value))}
                        onFocus={() => setFocusTarget({ blockId: block.id, itemIndex })}
                        disabled={disabled}
                        placeholder="List item"
                        className="flex-1 text-sm text-slate-800 border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-50 disabled:opacity-60"
                      />
                      <button
                        type="button"
                        onClick={() => setBlocks(removeListItem(blocks, block.id, itemIndex))}
                        disabled={disabled}
                        aria-label="Remove item"
                        className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:opacity-40"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setBlocks(addListItem(blocks, block.id))}
                    disabled={disabled}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors disabled:opacity-40"
                  >
                    + Add item
                  </button>
                </div>
              )}

              {(block.type === 'signature_placeholder' || block.type === 'date') && (
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Label
                  </label>
                  <input
                    value={block.label}
                    onChange={(e) =>
                      setBlocks(updateBlock(blocks, block.id, { label: e.target.value } as Partial<TemplateBlock>))
                    }
                    disabled={disabled}
                    placeholder={block.type === 'date' ? 'Date' : 'Signature'}
                    className="w-full max-w-xs text-sm text-slate-800 border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:opacity-60"
                  />
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    {block.type === 'date'
                      ? 'Filled with the signing date when the client signs.'
                      : 'Where the client signature is placed on the final document.'}
                  </p>
                </div>
              )}

              {block.type === 'divider' && (
                <div className="py-1">
                  <hr className="border-slate-200" />
                  <p className="text-[10px] text-slate-400 mt-1.5 text-center">Horizontal rule</p>
                </div>
              )}

              {block.type === 'spacer' && (
                <p className="text-[10px] text-slate-400 text-center py-1">
                  Vertical space ({block.size})
                </p>
              )}
            </div>

            {hasError && (
              <div className="px-3 pb-3">
                {blockIssues.map((msg, i) => (
                  <p key={i} className="text-xs text-rose-600 font-medium">
                    {msg}
                  </p>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Add block */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setAddMenuOpen((v) => !v)}
          disabled={disabled}
          aria-expanded={addMenuOpen}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-200 rounded-2xl text-sm font-bold text-slate-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/40 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          Add block
        </button>

        {addMenuOpen && (
          <>
            {/* Click-away layer */}
            <div className="fixed inset-0 z-10" onClick={() => setAddMenuOpen(false)} aria-hidden="true" />
            <div className="absolute z-20 left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-lg p-2 grid grid-cols-2 gap-1">
              {BLOCK_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleAdd(type)}
                  className="text-left px-3 py-2 text-xs font-semibold text-slate-700 rounded-xl hover:bg-blue-50 hover:text-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {BLOCK_LABELS[type]}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function placeholderFor(type: BlockType): string {
  switch (type) {
    case 'heading':
      return 'Section heading';
    case 'consent':
      return 'Consent wording shown inside the document body';
    case 'footer':
      return 'Small print shown at the bottom';
    default:
      return 'Write here. Use the Variables panel to insert client data.';
  }
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`p-1.5 rounded-lg transition-colors focus:outline-none focus:ring-2 disabled:opacity-30 disabled:cursor-not-allowed ${
        danger
          ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50 focus:ring-rose-500'
          : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100 focus:ring-blue-500'
      }`}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {children}
      </svg>
    </button>
  );
}
