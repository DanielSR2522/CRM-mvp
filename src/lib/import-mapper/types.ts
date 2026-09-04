export type ImportSourceType = 'xlsx' | 'xls' | 'csv';

export type DestinationGroup = 'client' | 'health_policy' | 'other';

export type DestinationFieldId =
  | 'ignore'
  | 'client.full_name'
  | 'client.first_name'
  | 'client.last_name'
  | 'client.date_of_birth'
  | 'client.ssn'
  | 'client.phone'
  | 'client.email'
  | 'client.address'
  | 'client.city'
  | 'client.state'
  | 'client.zip'
  | 'client.agent'
  | 'client.external_legacy_id'
  | 'client.notes'
  | 'health_policy.carrier'
  | 'health_policy.policy_number'
  | 'health_policy.member_id'
  | 'health_policy.status'
  | 'health_policy.effective_date'
  | 'health_policy.term_date'
  | 'health_policy.premium'
  | 'health_policy.tax_credit'
  | 'health_policy.plan'
  | 'health_policy.marketplace_application_id'
  | 'health_policy.pending_action'
  | 'other.pending_action'
  | 'other.import_notes';

export interface DestinationField {
  id: DestinationFieldId;
  label: string;
  group: DestinationGroup;
}

export type ColumnMapping = Record<string, DestinationFieldId>;

export interface ParsedImportFile {
  filename: string;
  sourceType: ImportSourceType;
  columns: string[];
  rows: ImportSourceRow[];
  sampleRows: ImportSourceRow[];
  rowCount: number;
  suggestedMapping: ColumnMapping;
  sourceFingerprint: string;
}

export type ImportCell = string | number | boolean | Date | null;
export type ImportSourceRow = Record<string, ImportCell>;

export interface NormalizationIssue {
  field: DestinationFieldId | 'row';
  message: string;
  severity: 'warning' | 'error';
}

export interface NormalizedImportRecord {
  rowNumber: number;
  source: ImportSourceRow;
  client: {
    fullName: string | null;
    firstName: string | null;
    lastName: string | null;
    dateOfBirth: string | null;
    ssn: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    agentName: string | null;
    externalLegacyId: string | null;
    notes: string | null;
  };
  healthPolicy: {
    carrier: string | null;
    policyNumber: string | null;
    memberId: string | null;
    status: string | null;
    effectiveDate: string | null;
    termDate: string | null;
    premium: number | null;
    taxCredit: number | null;
    plan: string | null;
    marketplaceApplicationId: string | null;
    pendingAction: string | null;
  };
  importNotes: string | null;
  pendingAction: string | null;
  issues: NormalizationIssue[];
}

export interface DuplicateCandidate {
  clientId: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  ssn: string | null;
  score: number;
  reasons: string[];
}

export type DuplicateAction = 'review' | 'skip' | 'update_existing' | 'create_new';

export interface ImportPlanRow extends NormalizedImportRecord {
  duplicateCandidates: DuplicateCandidate[];
  duplicateAction: DuplicateAction;
  ready: boolean;
}

export interface ImportPlanSummary {
  totalRows: number;
  rowsReady: number;
  rowsWithWarnings: number;
  rowsWithErrors: number;
  probableDuplicates: number;
  clientsToCreate: number;
  existingClientsMatched: number;
  recordsSkipped: number;
  policyRecordsToCreate: number;
}

export interface ImportPlan {
  summary: ImportPlanSummary;
  rows: ImportPlanRow[];
}

export interface ExistingClientForDuplicate {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  personal?: {
    date_of_birth: string | null;
    ssn: string | null;
    email: string | null;
    phone: string | null;
  } | null;
}
