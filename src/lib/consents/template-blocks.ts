/**
 * Pure functions for working with template content blocks, variable extraction,
 * HTML rendering, canonical hashing, and normalization.
 *
 * Safe for both browser and Node.js environments.
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
// Type Guards
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

export function isLabelBlock(
  block: TemplateBlock
): block is Extract<TemplateBlock, { label: string }> {
  return block.type === 'signature_placeholder' || block.type === 'date';
}

export function isStructuralBlock(block: TemplateBlock): boolean {
  return (
    block.type === 'divider' ||
    block.type === 'spacer' ||
    block.type === 'signature_placeholder' ||
    block.type === 'date'
  );
}

// ---------------------------------------------------------------------------
// Crypto & Hashing
// ---------------------------------------------------------------------------

/**
 * Computes SHA-256 hex string cleanly in browser or Node.js.
 */
export async function sha256Hex(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);

  if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Fallback for Node CLI environments without Web Crypto
  try {
    const nodeCrypto = await import('node:crypto');
    return nodeCrypto.createHash('sha256').update(data).digest('hex');
  } catch (e) {
    throw new Error('No crypto engine available for SHA-256 hashing.');
  }
}

export async function computeContentHash(content: TemplateContent, consentText: string, _variablesUsed?: string[]): Promise<string> {
  return sha256Hex(
    canonicalize({
      rendered_content: content,
      consent_text: consentText,
    })
  );
}

// ---------------------------------------------------------------------------
// Block Editing Operations
// ---------------------------------------------------------------------------

export function addBlock(blocks: TemplateBlock[], type: BlockType, index?: number): TemplateBlock[] {
  const newBlock: any = { id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`, type };
  if (type === 'heading') { newBlock.level = 1; newBlock.text = ''; }
  else if (type === 'paragraph' || type === 'consent' || type === 'footer') { newBlock.text = ''; }
  else if (type === 'bullet_list' || type === 'numbered_list') { newBlock.items = ['']; }
  else if (type === 'spacer') { newBlock.size = 'medium'; }
  else if (type === 'signature_placeholder') { newBlock.label = 'Signature'; }
  else if (type === 'date') { newBlock.label = 'Date'; }
  else if (type === 'image') { newBlock.alignment = 'center'; newBlock.size = 'medium'; newBlock.alt_text = ''; newBlock.caption = ''; }
  else if (type === 'checkbox') { newBlock.label = 'I agree to the terms'; newBlock.description = ''; newBlock.required = true; newBlock.alignment = 'left'; }
  else if (type === 'yes_no') { newBlock.question = 'Do you authorize us to contact you?'; newBlock.yes_label = 'Yes, I authorize'; newBlock.no_label = 'No, I do not authorize'; newBlock.required = true; newBlock.alignment = 'left'; }
  else if (type === 'initials') { newBlock.label = 'Initials'; newBlock.required = true; }

  const next = [...(blocks || [])];
  if (typeof index === 'number' && index >= 0 && index <= next.length) {
    next.splice(index, 0, newBlock);
  } else {
    next.push(newBlock);
  }
  return next;
}

export function removeBlock(blocks: TemplateBlock[], id: string): TemplateBlock[] {
  return (blocks || []).filter((b) => b.id !== id);
}

export function moveBlock(blocks: TemplateBlock[], id: string, direction: 'up' | 'down'): TemplateBlock[] {
  const safe = blocks || [];
  const idx = safe.findIndex((b) => b.id === id);
  if (idx < 0) return safe;
  const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= safe.length) return safe;
  const next = [...safe];
  const [removed] = next.splice(idx, 1);
  next.splice(targetIdx, 0, removed);
  return next;
}

export function updateBlock(blocks: TemplateBlock[], id: string, patch: Partial<TemplateBlock>): TemplateBlock[] {
  return (blocks || []).map((b) => (b.id === id ? ({ ...b, ...patch } as TemplateBlock) : b));
}

export function duplicateBlock(blocks: TemplateBlock[], id: string): TemplateBlock[] {
  const safe = blocks || [];
  const idx = safe.findIndex((b) => b.id === id);
  if (idx < 0) return safe;
  const original = safe[idx];
  const copy = { ...JSON.parse(JSON.stringify(original)), id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 4)}` };
  const next = [...safe];
  next.splice(idx + 1, 0, copy);
  return next;
}

export function changeBlockType(blocks: TemplateBlock[], id: string, newType: BlockType): TemplateBlock[] {
  return (blocks || []).map((b) => {
    if (b.id !== id) return b;
    const base = { id: b.id, type: newType };
    if (newType === 'heading') return { ...base, type: 'heading', level: 1, text: (b as any).text || '' };
    if (newType === 'paragraph' || newType === 'consent' || newType === 'footer') return { ...base, type: newType, text: (b as any).text || '' };
    if (newType === 'bullet_list' || newType === 'numbered_list') return { ...base, type: newType, items: (b as any).items || [''] };
    if (newType === 'spacer') return { ...base, type: 'spacer', size: 'medium' };
    if (newType === 'signature_placeholder') return { ...base, type: 'signature_placeholder', label: 'Signature' };
    if (newType === 'date') return { ...base, type: 'date', label: 'Date' };
    if (newType === 'image') return { ...base, type: 'image', alignment: 'center', size: 'medium', alt_text: '', caption: '' };
    if (newType === 'checkbox') return { ...base, type: 'checkbox', label: 'I agree to the terms', description: '', required: true, alignment: 'left' };
    if (newType === 'yes_no') return { ...base, type: 'yes_no', question: 'Do you authorize us to contact you?', yes_label: 'Yes, I authorize', no_label: 'No, I do not authorize', required: true, alignment: 'left' };
    if (newType === 'initials') return { ...base, type: 'initials', label: 'Initials', required: true };
    return { ...base, type: 'divider' } as TemplateBlock;
  });
}

export function addListItem(blocks: TemplateBlock[], id: string): TemplateBlock[] {
  return (blocks || []).map((b) => {
    if (b.id !== id || (b.type !== 'bullet_list' && b.type !== 'numbered_list')) return b;
    return { ...b, items: [...(b.items || []), ''] };
  });
}

export function removeListItem(blocks: TemplateBlock[], id: string, index: number): TemplateBlock[] {
  return (blocks || []).map((b) => {
    if (b.id !== id || (b.type !== 'bullet_list' && b.type !== 'numbered_list')) return b;
    const items = [...(b.items || [])];
    items.splice(index, 1);
    return { ...b, items: items.length > 0 ? items : [''] };
  });
}

export function updateListItem(blocks: TemplateBlock[], id: string, index: number, text: string): TemplateBlock[] {
  return (blocks || []).map((b) => {
    if (b.id !== id || (b.type !== 'bullet_list' && b.type !== 'numbered_list')) return b;
    const items = [...(b.items || [])];
    items[index] = text;
    return { ...b, items };
  });
}

// ---------------------------------------------------------------------------
// HTML Conversion
// ---------------------------------------------------------------------------

function extractBlockText(block: TemplateBlock): string {
  if (isTextBlock(block)) return block.text || '';
  if (isListBlock(block)) return (block.items || []).join('\n');
  if (block.type === 'checkbox') return block.label || '';
  if (block.type === 'yes_no') return block.question || '';
  if (block.type === 'initials') return block.label || '';
  return '';
}

export function contentToHtml(content: any): string {
  if (!content) return '<p></p>';
  if (content.html && typeof content.html === 'string') return content.html;
  if (Array.isArray(content.blocks)) {
    const htmlParts: string[] = [];
    content.blocks.forEach((b: any) => {
      if (!b) return;
      if (b.type === 'heading') {
        const lvl = b.level || 1;
        htmlParts.push(`<h${lvl}>${b.text || ''}</h${lvl}>`);
      } else if (b.type === 'paragraph' || b.type === 'consent' || b.type === 'footer') {
        htmlParts.push(`<p>${b.text || ''}</p>`);
      } else if (b.type === 'bullet_list') {
        const items = (b.items || []).map((i: string) => `<li>${i}</li>`).join('');
        htmlParts.push(`<ul>${items}</ul>`);
      } else if (b.type === 'numbered_list') {
        const items = (b.items || []).map((i: string) => `<li>${i}</li>`).join('');
        htmlParts.push(`<ol>${items}</ol>`);
      } else if (b.type === 'divider') {
        htmlParts.push('<hr/>');
      } else if (b.type === 'image') {
        htmlParts.push(`<div data-element-type="image" data-element-id="${b.id}" data-alignment="${b.alignment || 'center'}" data-size="${b.size || 'medium'}"><img src="${b.url || ''}" alt="${b.alt_text || ''}" />${b.caption ? `<figcaption>${b.caption}</figcaption>` : ''}</div>`);
      } else if (b.type === 'checkbox') {
        htmlParts.push(`<div data-element-type="checkbox" data-element-id="${b.id}" data-required="${b.required !== false}" data-label="${b.label || ''}" data-description="${b.description || ''}">☐ ${b.label || ''}</div>`);
      } else if (b.type === 'yes_no') {
        htmlParts.push(`<div data-element-type="yes_no" data-element-id="${b.id}" data-required="${b.required !== false}" data-question="${b.question || ''}" data-yes-label="${b.yes_label || 'Yes'}" data-no-label="${b.no_label || 'No'}">○ ${b.yes_label || 'Yes'} ○ ${b.no_label || 'No'}</div>`);
      } else if (b.type === 'initials') {
        htmlParts.push(`<div data-element-type="initials" data-element-id="${b.id}" data-required="${b.required !== false}" data-label="${b.label || 'Initials'}">[ ${b.label || 'Initials'} ]</div>`);
      }
    });
    return htmlParts.join('') || '<p></p>';
  }
  return '<p></p>';
}

/** Every piece of text in the document that may carry variables. */
export function collectAllText(content: TemplateContent): string {
  if (!content) return '';
  if (typeof (content as any).html === 'string') {
    return (content as any).html;
  }
  return (content.blocks || []).map(extractBlockText).filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// Variables
// ---------------------------------------------------------------------------

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)\s*\}\}/g;

/**
 * Safely converts unbraced allowed tokens (e.g. agent.npn) to {{agent.npn}}
 * without corrupting normal prose.
 */
export function normalizeVariableDelimiters(text: string): string {
  if (!text || typeof text !== 'string') return '';
  let result = text;
  for (const token of ALLOWED_VARIABLES) {
    const escaped = token.replace(/\./g, '\\.');
    const regex = new RegExp(`(?<!\\{\\{\\s*)\\b${escaped}\\b(?!\\s*\\}\\})`, 'g');
    result = result.replace(regex, `{{${token}}}`);
  }
  return result;
}

/** Every token that literally appears in the content, deduped, in stable order. */
export function extractVariables(content: TemplateContent): string[] {
  const rawText = collectAllText(content) + '\n' + consentTextOf(content);
  const text = normalizeVariableDelimiters(rawText);
  const found = new Set<string>();

  for (const match of text.matchAll(VARIABLE_PATTERN)) {
    const cleanToken = match[1];
    if (ALLOWED_VARIABLES.includes(cleanToken)) {
      found.add(cleanToken);
    }
  }
  return Array.from(found).sort();
}

/** Tokens present in the content but not on the V1 allow-list. */
export function findUnknownVariables(tokens: string[]): string[] {
  const safeTokens = Array.isArray(tokens) ? tokens : [];
  return safeTokens.filter((t) => {
    const clean = t.replace(/^\{\{|\}\}$/g, '').trim();
    return !ALLOWED_VARIABLES.includes(clean);
  });
}

/** Same as extractVariables but takes raw text */
export function extractVariablesFromText(text: string): string[] {
  if (!text || typeof text !== 'string') return [];
  const normalized = normalizeVariableDelimiters(text);
  const found = new Set<string>();
  for (const match of normalized.matchAll(VARIABLE_PATTERN)) {
    const cleanToken = match[1];
    if (ALLOWED_VARIABLES.includes(cleanToken)) {
      found.add(cleanToken);
    }
  }
  return Array.from(found).sort();
}

/** Placeholder used by the preview */
export function tokenToDisplay(token: string): string {
  const clean = token.replace(/^\{\{|\}\}$/g, '').trim();
  return `{{${clean}}}`;
}

/** Internal: consent blocks contribute their text to the variable scan. */
function consentTextOf(content: TemplateContent): string {
  if (!content || !Array.isArray(content.blocks)) return '';
  return content.blocks
    .filter((b) => b && b.type === 'consent')
    .map((b) => (b.type === 'consent' ? b.text || '' : ''))
    .join('\n');
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

export function normalizeContent(content: TemplateContent): TemplateContent {
  if (!content) return { blocks: [] };
  if (content.html && typeof content.html === 'string') {
    return {
      html: normalizeVariableDelimiters(content.html),
      blocks: Array.isArray(content.blocks) ? content.blocks : [],
      signing_config: content.signing_config,
      imported: content.imported,
    };
  }

  const blocks: TemplateBlock[] = [];
  const safeBlocks = Array.isArray(content.blocks) ? content.blocks : [];

  for (const block of safeBlocks) {
    if (!block) continue;
    if (isTextBlock(block)) {
      const text = normalizeText(normalizeVariableDelimiters(block.text || ''));
      if (!text) continue;
      blocks.push({ ...block, text });
      continue;
    }

    if (isListBlock(block)) {
      const items = (block.items || []).map((i) => normalizeText(normalizeVariableDelimiters(i))).filter(Boolean);
      if (items.length === 0) continue;
      blocks.push({ ...block, items });
      continue;
    }

    if (isLabelBlock(block)) {
      const label = normalizeText(block.label || '');
      blocks.push({ ...block, label: label || defaultLabelFor(block.type) });
      continue;
    }

    blocks.push(block);
  }

  return { ...content, blocks };
}

function defaultLabelFor(type: BlockType): string {
  return type === 'date' ? 'Date' : 'Signature';
}

/** Collapses internal whitespace runs and trims the ends. Newlines survive. */
export function normalizeText(value: string): string {
  if (!value || typeof value !== 'string') return '';
  return value
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Canonical Serialization
// ---------------------------------------------------------------------------

export function canonicalize(obj: any): string {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj === 'boolean' || typeof obj === 'number') return JSON.stringify(obj);
  if (typeof obj === 'string') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalize).join(',') + ']';
  }
  if (typeof obj === 'object') {
    const keys = Object.keys(obj).sort();
    const entries = keys.map((k) => [k, obj[k]]);
    return '{' + entries.map(([k, v]) => JSON.stringify(k) + ':' + canonicalize(v)).join(',') + '}';
  }
  return JSON.stringify(String(obj));
}
