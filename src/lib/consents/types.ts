/**
 * Consents & Signatures — shared types.
 *
 * These mirror migration_electronic_signatures.sql exactly. If a CHECK constraint
 * changes there, it must change here too, otherwise the UI will happily build a
 * payload the database rejects at insert time.
 */

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

/** consent_templates.status */
export type TemplateStatus = 'draft' | 'active' | 'inactive' | 'archived';

/** consent_templates.language — the CHECK constraint only allows these two. */
export type TemplateLanguage = 'en' | 'es';

export const TEMPLATE_STATUSES: TemplateStatus[] = ['draft', 'active', 'inactive', 'archived'];
export const TEMPLATE_LANGUAGES: TemplateLanguage[] = ['en', 'es'];

export const LANGUAGE_LABELS: Record<TemplateLanguage, string> = {
  en: 'English',
  es: 'Spanish',
};

/** A row of public.consent_templates. */
export interface ConsentTemplate {
  id: string;
  agent_id: string;
  created_by: string;
  internal_name: string;
  public_title: string;
  description: string | null;
  language: TemplateLanguage;
  current_version: number;
  status: TemplateStatus;
  usage_count: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

/** A row of public.consent_template_versions. */
export interface ConsentTemplateVersion {
  id: string;
  template_id: string;
  version_number: number;
  content: TemplateContent;
  consent_text: string;
  variables_used: string[];
  content_hash: string | null;
  created_by: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Block content
//
// The canonical stored shape is structured JSON, never HTML. HTML only ever
// exists at render time, produced from these blocks. That is what makes it
// impossible for a stored template to carry a script or an event handler.
// ---------------------------------------------------------------------------

export type BlockType =
  | 'heading'
  | 'paragraph'
  | 'bullet_list'
  | 'numbered_list'
  | 'divider'
  | 'spacer'
  | 'consent'
  | 'signature_placeholder'
  | 'date'
  | 'footer';

export const BLOCK_TYPES: BlockType[] = [
  'heading',
  'paragraph',
  'bullet_list',
  'numbered_list',
  'divider',
  'spacer',
  'consent',
  'signature_placeholder',
  'date',
  'footer',
];

export const BLOCK_LABELS: Record<BlockType, string> = {
  heading: 'Heading',
  paragraph: 'Paragraph',
  bullet_list: 'Bullet list',
  numbered_list: 'Numbered list',
  divider: 'Divider',
  spacer: 'Spacer',
  consent: 'Consent statement',
  signature_placeholder: 'Signature area',
  date: 'Date',
  footer: 'Footer',
};

export type HeadingLevel = 1 | 2 | 3;

interface BaseBlock {
  /** Stable across edits — reordering must never regenerate it. */
  id: string;
  type: BlockType;
}

export interface HeadingBlock extends BaseBlock {
  type: 'heading';
  level: HeadingLevel;
  text: string;
}

export interface ParagraphBlock extends BaseBlock {
  type: 'paragraph';
  text: string;
}

export interface BulletListBlock extends BaseBlock {
  type: 'bullet_list';
  items: string[];
}

export interface NumberedListBlock extends BaseBlock {
  type: 'numbered_list';
  items: string[];
}

export interface DividerBlock extends BaseBlock {
  type: 'divider';
}

export interface SpacerBlock extends BaseBlock {
  type: 'spacer';
  size: 'small' | 'medium' | 'large';
}

/**
 * The in-document consent paragraph. Distinct from consent_text, which is the
 * checkbox statement the signer must tick. A template may show the wording in
 * the body and again at the checkbox.
 */
export interface ConsentBlock extends BaseBlock {
  type: 'consent';
  text: string;
}

export interface SignaturePlaceholderBlock extends BaseBlock {
  type: 'signature_placeholder';
  label: string;
}

export interface DateBlock extends BaseBlock {
  type: 'date';
  label: string;
}

export interface FooterBlock extends BaseBlock {
  type: 'footer';
  text: string;
}

export type TemplateBlock =
  | HeadingBlock
  | ParagraphBlock
  | BulletListBlock
  | NumberedListBlock
  | DividerBlock
  | SpacerBlock
  | ConsentBlock
  | SignaturePlaceholderBlock
  | DateBlock
  | FooterBlock;

/** consent_template_versions.content — the CHECK requires a JSON object. */
export interface TemplateContent {
  blocks: TemplateBlock[];
  html?: string;
  signing_config?: any;
  imported?: any;
}

/** Blocks whose payload is a single free-text field carrying variables. */
export type TextBlock =
  | HeadingBlock
  | ParagraphBlock
  | ConsentBlock
  | FooterBlock;

/** Blocks whose payload is a list of free-text items carrying variables. */
export type ListBlock = BulletListBlock | NumberedListBlock;

// ---------------------------------------------------------------------------
// Variables — V1
//
// Only variables with a confirmed real column behind them. Nothing is derived,
// split or invented. Agent and agency variables are deliberately absent: the
// profiles table has no migration in this repo and its shape is unconfirmed.
// ---------------------------------------------------------------------------

export interface VariableDefinition {
  /** The token as written in a block, without braces. */
  token: string;
  label: string;
  /** Where the value will come from in Phase 4. Shown in the picker. */
  source: string;
  example: string;
}

export interface VariableGroup {
  key: string;
  label: string;
  variables: VariableDefinition[];
}

import { VARIABLE_REGISTRY, ALL_REGISTERED_TOKENS } from './variable-registry';

export const VARIABLE_GROUPS: VariableGroup[] = VARIABLE_REGISTRY.map((g) => ({
  key: g.key,
  label: g.label,
  variables: g.variables.map((v) => ({
    token: v.token,
    label: v.label,
    source: `${v.sourceTable}.${v.sourceField}`,
    example: v.example,
  })),
}));

/** Flat allow-list. Anything outside this set is rejected by validation. */
export const ALLOWED_VARIABLES: string[] = ALL_REGISTERED_TOKENS;

// ---------------------------------------------------------------------------
// Signature requests
// ---------------------------------------------------------------------------

/** signature_requests.status */
export type RequestStatus =
  | 'draft'
  | 'pending'
  | 'sent'
  | 'viewed'
  | 'signed'
  | 'declined'
  | 'expired'
  | 'cancelled'
  | 'failed';

export const REQUEST_STATUSES: RequestStatus[] = [
  'draft',
  'pending',
  'sent',
  'viewed',
  'signed',
  'declined',
  'expired',
  'cancelled',
  'failed',
];

/** signature_requests.selected_delivery_channel */
export type DeliveryChannel = 'email' | 'whatsapp' | 'sms' | 'copy_link';

/** signature_requests.final_document_status */
export type FinalDocumentStatus =
  | 'not_started'
  | 'pending'
  | 'generating'
  | 'generated'
  | 'failed';

/** A row of public.signature_requests. */
export interface SignatureRequest {
  id: string;
  client_id: string;
  policy_id: string | null;
  template_id: string;
  template_version_id: string;
  created_by: string;
  title: string;
  rendered_content: TemplateContent;
  merge_data_snapshot: MergeDataSnapshot;
  status: RequestStatus;
  selected_delivery_channel: DeliveryChannel | null;
  original_document_hash: string | null;
  final_document_hash: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  declined_at: string | null;
  cancelled_at: string | null;
  expires_at: string | null;
  final_file_path: string | null;
  final_document_status: FinalDocumentStatus;
  final_document_error: string | null;
  created_at: string;
  updated_at: string;
}

/** A row of public.signature_request_signers. */
export interface SignatureRequestSigner {
  id: string;
  request_id: string;
  signer_order: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  token_hash: string;
  token_expires_at: string;
  token_revoked_at: string | null;
  signature_method: 'draw' | 'typed' | null;
  signature_image_path: string | null;
  typed_signature: string | null;
  consent_text_snapshot: string | null;
  consent_version: string | null;
  consent_accepted_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  declined_at: string | null;
  created_at: string;
}

/** A request joined with the bits the client tab needs to render a row. */
export interface ClientConsentRow extends SignatureRequest {
  template_internal_name: string | null;
  template_public_title: string | null;
  signer_name: string | null;
  signer_email: string | null;
}

/**
 * A request joined with everything the cross-client dashboard shows.
 *
 * Carries the client's name (the tab does not need it — the dashboard does) and
 * the signer's contact details, which decide whether the WhatsApp/SMS/Email
 * actions are offered.
 */
export interface DashboardConsentRow extends SignatureRequest {
  client_name: string | null;
  template_internal_name: string | null;
  signer_name: string | null;
  signer_email: string | null;
  signer_phone: string | null;
}

// ---------------------------------------------------------------------------
// Merge data
// ---------------------------------------------------------------------------

/**
 * Resolved values keyed by token, exactly as they will appear in the document.
 * A token with no real value is absent from this map rather than present as an
 * empty string — that distinction is what lets findUnresolvedVariables tell
 * "blank on purpose" apart from "we have no data".
 */
export type MergeValues = Record<string, string>;

/**
 * What gets frozen into signature_requests.merge_data_snapshot.
 *
 * It records the values AND where they came from, so a year from now it is
 * possible to explain why a document said what it said, even if the client
 * record has changed since.
 */
export interface MergeDataSnapshot {
  /** Token -> resolved display value. Only tokens that actually resolved. */
  values: MergeValues;
  /** Tokens the template used but that had no value at render time. */
  unresolved: string[];
  /**
   * The merged consent statement, frozen alongside the document.
   *
   * signature_requests has a column for rendered_content but none for the
   * rendered consent text, and original_document_hash covers both — so without
   * persisting it here the hash could never be re-verified. It lives in the
   * snapshot because that is jsonb we own, which avoids a schema change.
   */
  rendered_consent_text: string;
  /** Ids the data was read from, for traceability. */
  sources: {
    client_id: string;
    policy_id: string | null;
  };
  /** ISO timestamp of when the merge ran. */
  captured_at: string;
  /** Schema version of this snapshot shape, so later phases can migrate it. */
  snapshot_version: 1;
}

/** Raw client data assembled from real tables. */
export interface ClientMergeData {
  client_id: string;
  agent_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  secondary_email?: string | null;
  secondary_phone?: string | null;
  date_of_birth: string | null;
  gender?: string | null;
  marital_status?: string | null;
  immigration_status?: string | null;
  ssn?: string | null;
  address: string | null;
  address_line_2?: string | null;
  city: string | null;
  state?: string | null;
  zip_code: string | null;
  county: string | null;
  agency_name?: string | null;
  agent_info?: {
    full_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
    agency_name?: string | null;
    npn?: string | null;
    license_number?: string | null;
    license_state?: string | null;
    business_address?: string | null;
    city?: string | null;
    state?: string | null;
    zip_code?: string | null;
    website?: string | null;
  } | null;
}

/** Raw policy data (P&C, Health, or Life). Absent when no policy is attached. */
export interface PolicyMergeData {
  policy_id: string;
  client_id: string;
  category: 'pc' | 'health' | 'life';
  policy_number: string | null;
  policy_type: string | null;
  policy_subtype: string | null;
  company_name: string | null;
  writing_company?: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  full_premium: number | null;
  monthly_premium?: number | null;
  status?: string | null;
  ownership_type?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  payment_frequency?: string | null;
  broker_name?: string | null;
  // Health fields
  plan_name?: string | null;
  plan_id?: string | null;
  application_number?: string | null;
  marketplace_id?: string | null;
  carrier?: string | null;
  renovation_status?: string | null;
  enrolled?: boolean | null;
  tax_credit?: number | null;
  household_income?: number | null;
  tax_household_size?: number | null;
  coverage_members_count?: number | null;
  tax_members?: any[] | null;
  npn?: string | null;
  // Life fields
  product_type?: string | null;
  policy_date?: string | null;
  face_amount?: number | null;
  time_to_pay_premium?: string | null;
  level_period?: string | null;
  conversion_credit?: number | null;
  beneficiaries_count?: number | null;
  beneficiaries_names?: string | null;
  total_beneficiary_percentage?: string | null;
}

/** One variable the document needs but could not be filled. */
export interface UnresolvedVariable {
  token: string;
  label: string;
  /** Why it is empty, in words an agent can act on. */
  reason: string;
  /** True when the token needs a policy and none was selected. */
  needsPolicy: boolean;
}

// ---------------------------------------------------------------------------
// Service payloads
// ---------------------------------------------------------------------------

/** Everything the editor produces. Hash and variables_used are derived, never typed. */
export interface TemplateDraft {
  internal_name: string;
  public_title: string;
  description: string;
  language: TemplateLanguage;
  content: TemplateContent;
  consent_text: string;
}

/** What a save actually did, so the UI can tell the user the truth. */
export type SaveOutcome =
  | { kind: 'created'; templateId: string; version: number }
  | { kind: 'version_updated'; templateId: string; version: number }
  | { kind: 'version_published'; templateId: string; version: number };
