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

export const VARIABLE_GROUPS: VariableGroup[] = [
  {
    key: 'client',
    label: 'Client',
    variables: [
      { token: 'client.full_name', label: 'Full name', source: 'clients.full_name', example: 'Maria Elena Pabon' },
      { token: 'client.email', label: 'Email', source: 'clients.email', example: 'maria@example.com' },
      { token: 'client.phone', label: 'Phone', source: 'clients.phone', example: '(305) 555-0148' },
      { token: 'client.date_of_birth', label: 'Date of birth', source: 'client_personal_information.date_of_birth', example: '04/17/1985' },
      { token: 'client.address', label: 'Address', source: 'client_residence_information.address', example: '820 NW 12th Ave' },
      { token: 'client.city', label: 'City', source: 'client_residence_information.city', example: 'Miami' },
      { token: 'client.zip_code', label: 'ZIP code', source: 'client_residence_information.zip_code', example: '33136' },
      { token: 'client.county', label: 'County', source: 'client_residence_information.county', example: 'Miami-Dade' },
    ],
  },
  {
    key: 'policy',
    label: 'Policy',
    variables: [
      { token: 'policy.policy_number', label: 'Policy number', source: 'policies.policy_number', example: 'FL-2210-88431' },
      { token: 'policy.policy_type', label: 'Line of business', source: 'policies.policy_type', example: 'Homeowners' },
      { token: 'policy.policy_subtype', label: 'Sub-type', source: 'policies.policy_subtype', example: 'HO3' },
      { token: 'policy.company_name', label: 'Company', source: 'policies.company_name', example: 'Citizens Property' },
      { token: 'policy.effective_date', label: 'Effective date', source: 'policies.effective_date', example: '01/01/2026' },
      { token: 'policy.expiration_date', label: 'Expiration date', source: 'policies.expiration_date', example: '01/01/2027' },
      { token: 'policy.full_premium', label: 'Full premium', source: 'COALESCE(policies.total_premium, policies.premium)', example: '$2,480.00' },
    ],
  },
  {
    key: 'system',
    label: 'System',
    variables: [
      { token: 'current_date', label: "Today's date", source: 'Generated at send time', example: '07/16/2026' },
      { token: 'current_year', label: 'Current year', source: 'Generated at send time', example: '2026' },
    ],
  },
];

/** Flat allow-list. Anything outside this set is rejected by validation. */
export const ALLOWED_VARIABLES: string[] = VARIABLE_GROUPS.flatMap((g) =>
  g.variables.map((v) => v.token)
);

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

/** Raw client data assembled from the three real tables. */
export interface ClientMergeData {
  client_id: string;
  agent_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  address: string | null;
  city: string | null;
  zip_code: string | null;
  county: string | null;
}

/** Raw policy data. Absent when no policy is attached. */
export interface PolicyMergeData {
  policy_id: string;
  client_id: string;
  policy_number: string | null;
  policy_type: string | null;
  policy_subtype: string | null;
  company_name: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  /** COALESCE(total_premium, premium) — never annual_premium. */
  full_premium: number | null;
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
