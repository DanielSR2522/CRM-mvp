/**
 * Consents & Signatures — block model helpers.
 *
 * Pure functions over TemplateContent. No React, no Supabase. Everything here is
 * immutable: helpers return new arrays rather than mutating, so React state
 * updates stay predictable.
 */

import type {
  BlockType,
  ListBlock,
  TemplateBlock,
  TemplateContent,
  TextBlock,
} from './types';
import { ALLOWED_VARIABLES } from './types';

// ---------------------------------------------------------------------------
// Ids
// ---------------------------------------------------------------------------

/**
 * Block ids must be stable across reorders and survive a round trip through
 * JSONB. crypto.randomUUID is available in every browser this app targets and
 * in Node 19+, but it is only exposed on secure origins — the fallback keeps
 * the editor usable if that ever bites.
 */
export function newBlockId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'blk-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createBlock(type: BlockType): TemplateBlock {
  const id = newBlockId();

  switch (type) {
    case 'heading':
      return { id, type: 'heading', level: 2, text: '' };
    case 'paragraph':
      return { id, type: 'paragraph', text: '' };
    case 'bullet_list':
      return { id, type: 'bullet_list', items: [''] };
    case 'numbered_list':
      return { id, type: 'numbered_list', items: [''] };
    case 'divider':
      return { id, type: 'divider' };
    case 'spacer':
      return { id, type: 'spacer', size: 'medium' };
    case 'consent':
      return { id, type: 'consent', text: '' };
    case 'signature_placeholder':
      return { id, type: 'signature_placeholder', label: 'Signature' };
    case 'date':
      return { id, type: 'date', label: 'Date' };
    case 'footer':
      return { id, type: 'footer', text: '' };
  }
}

/** The starting point for a brand new template. */
export function createStarterContent(): TemplateContent {
  return {
    blocks: [
      { id: newBlockId(), type: 'heading', level: 1, text: '' },
      { id: newBlockId(), type: 'paragraph', text: '' },
      { id: newBlockId(), type: 'signature_placeholder', label: 'Signature' },
      { id: newBlockId(), type: 'date', label: 'Date' },
    ],
  };
}

export function emptyContent(): TemplateContent {
  return { blocks: [] };
}

// ---------------------------------------------------------------------------
// Type predicates
// ---------------------------------------------------------------------------

export function isTextBlock(block: TemplateBlock): block is TextBlock {
  return (
    block.type === 'heading' ||
    block.type === 'paragraph' ||
    block.type === 'consent' ||
    block.type === 'footer'
  );
}

export function isListBlock(block: TemplateBlock): block is ListBlock {
  return block.type === 'bullet_list' || block.type === 'numbered_list';
}

/** Blocks with a label the user can edit but which carry no variables. */
export function isLabelBlock(
  block: TemplateBlock
): block is Extract<TemplateBlock, { label: string }> {
  return block.type === 'signature_placeholder' || block.type === 'date';
}

/** Blocks that render on their own with nothing to type into. */
export function isStructuralBlock(block: TemplateBlock): boolean {
  return block.type === 'divider' || block.type === 'spacer';
}

// ---------------------------------------------------------------------------
// Mutation helpers (immutable)
// ---------------------------------------------------------------------------

export function addBlock(
  blocks: TemplateBlock[],
  type: BlockType,
  atIndex?: number
): TemplateBlock[] {
  const block = createBlock(type);
  if (atIndex === undefined || atIndex < 0 || atIndex >= blocks.length) {
    return [...blocks, block];
  }
  const next = [...blocks];
  next.splice(atIndex + 1, 0, block);
  return next;
}

export function removeBlock(blocks: TemplateBlock[], id: string): TemplateBlock[] {
  return blocks.filter((b) => b.id !== id);
}

export function moveBlock(
  blocks: TemplateBlock[],
  id: string,
  direction: 'up' | 'down'
): TemplateBlock[] {
  const index = blocks.findIndex((b) => b.id === id);
  if (index === -1) return blocks;

  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= blocks.length) return blocks;

  const next = [...blocks];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Duplicates a block right below the original, with a fresh id. */
export function duplicateBlock(blocks: TemplateBlock[], id: string): TemplateBlock[] {
  const index = blocks.findIndex((b) => b.id === id);
  if (index === -1) return blocks;

  const source = blocks[index];
  const copy = { ...structuredCloneBlock(source), id: newBlockId() };

  const next = [...blocks];
  next.splice(index + 1, 0, copy);
  return next;
}

export function updateBlock(
  blocks: TemplateBlock[],
  id: string,
  patch: Partial<TemplateBlock>
): TemplateBlock[] {
  return blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as TemplateBlock) : b));
}

/**
 * Changing a block's type rebuilds it from scratch but carries the text across
 * where both shapes can hold it, so switching paragraph -> consent by mistake
 * does not silently destroy what was typed.
 */
export function changeBlockType(
  blocks: TemplateBlock[],
  id: string,
  type: BlockType
): TemplateBlock[] {
  return blocks.map((b) => {
    if (b.id !== id) return b;
    if (b.type === type) return b;

    const fresh = { ...createBlock(type), id: b.id };
    const carried = extractBlockText(b);
    if (!carried) return fresh;

    if (isTextBlock(fresh)) {
      return { ...fresh, text: carried };
    }
    if (isListBlock(fresh)) {
      return { ...fresh, items: [carried] };
    }
    return fresh;
  });
}

/** Structural clone without relying on structuredClone (arrays are the only nesting). */
function structuredCloneBlock(block: TemplateBlock): TemplateBlock {
  if (isListBlock(block)) {
    return { ...block, items: [...block.items] };
  }
  return { ...block };
}

// ---------------------------------------------------------------------------
// List item helpers
// ---------------------------------------------------------------------------

export function addListItem(blocks: TemplateBlock[], id: string): TemplateBlock[] {
  return blocks.map((b) => {
    if (b.id !== id || !isListBlock(b)) return b;
    return { ...b, items: [...b.items, ''] };
  });
}

export function updateListItem(
  blocks: TemplateBlock[],
  id: string,
  index: number,
  value: string
): TemplateBlock[] {
  return blocks.map((b) => {
    if (b.id !== id || !isListBlock(b)) return b;
    const items = [...b.items];
    items[index] = value;
    return { ...b, items };
  });
}

export function removeListItem(
  blocks: TemplateBlock[],
  id: string,
  index: number
): TemplateBlock[] {
  return blocks.map((b) => {
    if (b.id !== id || !isListBlock(b)) return b;
    // Never leave a list with zero rows — an empty list block is unusable in the UI.
    if (b.items.length <= 1) return { ...b, items: [''] };
    return { ...b, items: b.items.filter((_, i) => i !== index) };
  });
}

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------

/** The user-authored text of a block, joined for list types. Empty for structural. */
export function extractBlockText(block: TemplateBlock): string {
  if (isTextBlock(block)) return block.text;
  if (isListBlock(block)) return block.items.join('\n');
  return '';
}

/** Every piece of text in the document that may carry variables. */
export function collectAllText(content: TemplateContent): string {
  return content.blocks.map(extractBlockText).filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// Variables
// ---------------------------------------------------------------------------

/**
 * Matches {{ token }} with optional inner whitespace. Deliberately strict about
 * the token charset: letters, digits, underscore and a single dot separator.
 * Anything else is not a variable, it is literal text the signer will see.
 */
const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)\s*\}\}/g;

/** Every token that literally appears in the content, deduped, in stable order. */
export function extractVariables(content: TemplateContent): string[] {
  const text = collectAllText(content) + '\n' + consentTextOf(content);
  const found = new Set<string>();

  for (const match of text.matchAll(VARIABLE_PATTERN)) {
    found.add(match[1]);
  }
  // Sorted so variables_used is deterministic — the same content always produces
  // the same array, which matters because the hash covers it.
  return Array.from(found).sort();
}

/** Tokens present in the content but not on the V1 allow-list. */
export function findUnknownVariables(tokens: string[]): string[] {
  return tokens.filter((t) => !ALLOWED_VARIABLES.includes(t));
}

/**
 * Same as extractVariables but takes raw text — used to validate consent_text,
 * which lives outside the block tree.
 */
export function extractVariablesFromText(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(VARIABLE_PATTERN)) {
    found.add(match[1]);
  }
  return Array.from(found).sort();
}

/** Placeholder used by the preview: shows the token's example value. */
export function tokenToDisplay(token: string): string {
  return `{{${token}}}`;
}

/** Internal: consent blocks contribute their text to the variable scan. */
function consentTextOf(content: TemplateContent): string {
  return content.blocks
    .filter((b) => b.type === 'consent')
    .map((b) => (b.type === 'consent' ? b.text : ''))
    .join('\n');
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Runs before every save. Trims, collapses runs of spaces, and drops blocks that
 * carry nothing.
 *
 * Structural blocks (divider, spacer, signature_placeholder, date) are never
 * dropped: "empty" is their normal state, and removing a signature area because
 * it has no text would quietly break the document.
 */
export function normalizeContent(content: TemplateContent): TemplateContent {
  const blocks: TemplateBlock[] = [];

  for (const block of content.blocks) {
    if (isTextBlock(block)) {
      const text = normalizeText(block.text);
      if (!text) continue; // an empty paragraph/heading is noise
      blocks.push({ ...block, text });
      continue;
    }

    if (isListBlock(block)) {
      const items = block.items.map(normalizeText).filter(Boolean);
      if (items.length === 0) continue; // a list with no items says nothing
      blocks.push({ ...block, items });
      continue;
    }

    if (isLabelBlock(block)) {
      // A blank label is legitimate — fall back to a sensible default rather than
      // dropping the block, because its presence is what matters.
      const label = normalizeText(block.label);
      blocks.push({ ...block, label: label || defaultLabelFor(block.type) });
      continue;
    }

    blocks.push(block);
  }

  return { blocks };
}

function defaultLabelFor(type: BlockType): string {
  return type === 'date' ? 'Date' : 'Signature';
}

/** Collapses internal whitespace runs and trims the ends. Newlines survive. */
export function normalizeText(value: string): string {
  return value
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/**
 * Canonical JSON: object keys sorted at every level, so two structurally
 * identical documents always serialize byte-for-byte identically. Without this,
 * key order alone would change the hash and make it useless as an identity.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalize).join(',') + ']';
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return '{' + entries.map(([k, v]) => JSON.stringify(k) + ':' + canonicalize(v)).join(',') + '}';
}

/**
 * Lowercase hex SHA-256 via Web Crypto — matches the
 * `content_hash ~ '^[a-f0-9]{64}$'` CHECK in the migration.
 *
 * crypto.subtle only exists on secure origins (https, or localhost). If it is
 * missing we throw rather than fall back to a weaker digest: a wrong hash is
 * worse than no save, because it would be stored as if it were real.
 */
export async function sha256Hex(input: string): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error(
      'Web Crypto is unavailable, so the content hash cannot be computed. This page must be served over HTTPS or from localhost.'
    );
  }
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * The hash covers content, consent_text and variables_used together: all three
 * are what a signer would be shown, so a change to any of them is a different
 * document.
 */
export async function computeContentHash(
  content: TemplateContent,
  consentText: string,
  variablesUsed: string[]
): Promise<string> {
  return sha256Hex(
    canonicalize({
      content,
      consent_text: consentText,
      variables_used: variablesUsed,
    })
  );
}
