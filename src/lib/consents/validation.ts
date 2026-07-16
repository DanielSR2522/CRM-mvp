/**
 * Consents & Signatures — template validation.
 *
 * Mirrors the CHECK constraints in migration_electronic_signatures.sql so the UI
 * refuses a bad payload before Supabase does. The database remains the authority;
 * this layer exists to give a readable error instead of a Postgres one.
 */

import type { TemplateContent, TemplateDraft, TemplateLanguage } from './types';
import { TEMPLATE_LANGUAGES } from './types';
import {
  extractVariables,
  extractVariablesFromText,
  findUnknownVariables,
  isLabelBlock,
  isListBlock,
  isStructuralBlock,
  isTextBlock,
  normalizeText,
} from './template-blocks';

export interface ValidationIssue {
  /** Which input to highlight. 'content' covers the block list as a whole. */
  field: 'internal_name' | 'public_title' | 'language' | 'content' | 'consent_text';
  message: string;
  /** Set when the issue belongs to one specific block. */
  blockId?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export function isValidLanguage(value: string): value is TemplateLanguage {
  return (TEMPLATE_LANGUAGES as string[]).includes(value);
}

/**
 * Validates a draft as the user typed it. Call on the normalized draft before
 * saving; the editor also calls it live to drive inline errors.
 */
export function validateTemplateDraft(draft: TemplateDraft): ValidationResult {
  const issues: ValidationIssue[] = [];

  // ---- Identity fields --------------------------------------------------
  if (!normalizeText(draft.internal_name)) {
    issues.push({ field: 'internal_name', message: 'Internal name is required.' });
  }
  if (!normalizeText(draft.public_title)) {
    issues.push({ field: 'public_title', message: 'Public title is required.' });
  }
  if (!isValidLanguage(draft.language)) {
    issues.push({ field: 'language', message: 'Language must be English or Spanish.' });
  }

  // ---- Consent text -----------------------------------------------------
  const consentText = normalizeText(draft.consent_text);
  if (!consentText) {
    issues.push({
      field: 'consent_text',
      message: 'Consent statement is required — this is what the signer must accept before signing.',
    });
  }

  // ---- Content shape ----------------------------------------------------
  issues.push(...validateContentShape(draft.content));

  // ---- Variables --------------------------------------------------------
  // Tokens are scanned across blocks and consent_text together, because both are
  // rendered for the signer and both get merged in Phase 4.
  const contentTokens = extractVariables(draft.content);
  const consentTokens = extractVariablesFromText(draft.consent_text);
  const allTokens = Array.from(new Set([...contentTokens, ...consentTokens])).sort();

  const unknown = findUnknownVariables(allTokens);
  for (const token of unknown) {
    issues.push({
      field: 'content',
      message: `Unknown variable {{${token}}}. It has no real column behind it and would render as raw text. Use the Variable picker to insert a supported one.`,
    });
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Structural checks on the block tree. Separated so the editor can surface
 * per-block problems without re-running the whole draft validation.
 */
export function validateContentShape(content: TemplateContent): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!content || typeof content !== 'object' || !Array.isArray(content.blocks)) {
    issues.push({ field: 'content', message: 'Template content is malformed.' });
    return issues;
  }

  if (content.blocks.length === 0) {
    issues.push({ field: 'content', message: 'Add at least one block — an empty template cannot be sent.' });
    return issues;
  }

  const seenIds = new Set<string>();

  for (const block of content.blocks) {
    if (!block || typeof block !== 'object') {
      issues.push({ field: 'content', message: 'One of the blocks is malformed.' });
      continue;
    }

    if (!block.id) {
      issues.push({ field: 'content', message: `A ${block.type ?? 'unknown'} block is missing its id.` });
    } else if (seenIds.has(block.id)) {
      // Duplicate ids would make the editor address the wrong block on edit.
      issues.push({ field: 'content', blockId: block.id, message: 'Two blocks share the same id.' });
    } else {
      seenIds.add(block.id);
    }

    if (isTextBlock(block)) {
      if (typeof block.text !== 'string') {
        issues.push({ field: 'content', blockId: block.id, message: `${block.type} block has invalid text.` });
      } else if (!normalizeText(block.text)) {
        issues.push({
          field: 'content',
          blockId: block.id,
          message: `This ${block.type} block is empty. Add text or remove the block.`,
        });
      }
      if (block.type === 'heading' && ![1, 2, 3].includes(block.level)) {
        issues.push({ field: 'content', blockId: block.id, message: 'Heading level must be 1, 2 or 3.' });
      }
      continue;
    }

    if (isListBlock(block)) {
      if (!Array.isArray(block.items)) {
        issues.push({ field: 'content', blockId: block.id, message: 'List block has invalid items.' });
        continue;
      }
      const filled = block.items.filter((i) => normalizeText(i));
      if (filled.length === 0) {
        issues.push({
          field: 'content',
          blockId: block.id,
          message: 'This list has no items. Add one or remove the block.',
        });
      }
      continue;
    }

    if (isLabelBlock(block)) {
      if (typeof block.label !== 'string') {
        issues.push({ field: 'content', blockId: block.id, message: 'Block label is invalid.' });
      }
      continue;
    }

    if (isStructuralBlock(block)) {
      if (block.type === 'spacer' && !['small', 'medium', 'large'].includes(block.size)) {
        issues.push({ field: 'content', blockId: block.id, message: 'Spacer size is invalid.' });
      }
      continue;
    }

    issues.push({ field: 'content', message: `Unsupported block type "${(block as { type: string }).type}".` });
  }

  return issues;
}

/**
 * Guards the derived-vs-stored invariant: variables_used must be exactly what the
 * content actually contains. It is computed, never typed, but this catches a bug
 * in the computation before the value reaches the database.
 */
export function validateVariablesMatch(
  content: TemplateContent,
  consentText: string,
  variablesUsed: string[]
): ValidationIssue[] {
  const expected = Array.from(
    new Set([...extractVariables(content), ...extractVariablesFromText(consentText)])
  ).sort();

  const actual = [...variablesUsed].sort();

  const missing = expected.filter((t) => !actual.includes(t));
  const extra = actual.filter((t) => !expected.includes(t));

  const issues: ValidationIssue[] = [];
  if (missing.length > 0) {
    issues.push({
      field: 'content',
      message: `Internal error: variables ${missing.map((m) => `{{${m}}}`).join(', ')} are used but were not recorded.`,
    });
  }
  if (extra.length > 0) {
    issues.push({
      field: 'content',
      message: `Internal error: variables ${extra.map((m) => `{{${m}}}`).join(', ')} were recorded but are not used.`,
    });
  }
  return issues;
}

/** Groups issues by field so the form can render them next to the right input. */
export function issuesByField(issues: ValidationIssue[]): Record<string, string[]> {
  return issues.reduce<Record<string, string[]>>((acc, issue) => {
    (acc[issue.field] ||= []).push(issue.message);
    return acc;
  }, {});
}

/** Issues attached to one specific block. */
export function issuesForBlock(issues: ValidationIssue[], blockId: string): string[] {
  return issues.filter((i) => i.blockId === blockId).map((i) => i.message);
}
