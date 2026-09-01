export type CarrierType = 'oscar' | 'ambetter' | 'molina' | 'florida_blue' | 'aetna' | 'uhc' | 'cigna' | 'humana' | string;
export type SyncSourceType = 'manual_csv' | 'automated_portal';
export type CarrierStatusType = 'active' | 'inactive' | 'grace_period';
export type MatchStatusType = 'matched' | 'review' | 'unmatched' | 'ignored';
export type EventSeverityType = 'info' | 'warning' | 'critical';

export type CarrierEventType =
  | 'STATUS_CHANGED'
  | 'ENTERED_GRACE_PERIOD'
  | 'BECAME_INACTIVE'
  | 'BECAME_ACTIVE'
  | 'NEW_BALANCE'
  | 'BALANCE_CHANGED'
  | 'BALANCE_CLEARED'
  | 'PREMIUM_CHANGED'
  | 'PLAN_CHANGED'
  | 'AUTOPAY_CHANGED'
  | 'NEW_POLICY'
  | 'POLICY_MISSING';

export interface CarrierConnection {
  id: string;
  agent_id: string;
  carrier: CarrierType;
  connection_status: string; // 'imported', 'never_synced', 'connected', 'error'
  sync_source: SyncSourceType;
  last_sync_at?: string | null;
  last_success_at?: string | null;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CarrierSyncRun {
  id: string;
  connection_id?: string | null;
  agent_id: string;
  carrier: CarrierType;
  source: SyncSourceType;
  started_at: string;
  completed_at?: string | null;
  status: 'running' | 'completed' | 'failed';
  records_found: number;
  matched_count: number;
  review_count: number;
  unmatched_count: number;
  changed_count: number;
  error_message?: string | null;
}

export interface NormalizedCarrierRecord {
  external_member_id: string;
  member_name: string;
  date_of_birth?: string | null; // YYYY-MM-DD
  email?: string | null;
  phone?: string | null;
  mailing_address?: string | null;
  state?: string | null;
  enrollment_type?: string | null;
  on_exchange: boolean;
  plan?: string | null;
  balance: number;
  premium_amount: number;
  aptc_subsidy: number;
  lives: number;
  coverage_start_date?: string | null; // YYYY-MM-DD
  coverage_end_date?: string | null; // YYYY-MM-DD
  carrier_status: CarrierStatusType;
  autopay: boolean;
  account_creation_status?: string | null;
  ichra_member: boolean;
  estimated_fpl?: string | null;
  verification_needed?: string | null;
  verification_completed?: string | null;
  raw_data: Record<string, unknown>;
}

export interface CarrierRecordDB extends NormalizedCarrierRecord {
  id: string;
  connection_id?: string | null;
  agent_id: string;
  carrier: CarrierType;
  first_seen_at: string;
  last_seen_at: string;
  latest_sync_run_id?: string | null;
}

export interface CarrierClientMatchDB {
  id: string;
  agent_id: string;
  carrier: CarrierType;
  external_member_id: string;
  client_id?: string | null;
  match_status: MatchStatusType;
  confidence_score: number;
  match_method?: string | null;
  confirmed_at?: string | null;
  created_at: string;
  updated_at: string;

  // Joined fields for UI
  client?: {
    id: string;
    full_name: string;
    email?: string | null;
    phone?: string | null;
  } | null;
}

export interface CarrierPolicySnapshotDB {
  id: string;
  sync_run_id: string;
  agent_id: string;
  carrier: CarrierType;
  external_member_id: string;
  client_id?: string | null;
  carrier_status?: string | null;
  balance?: number | null;
  premium_amount?: number | null;
  plan?: string | null;
  coverage_start_date?: string | null;
  coverage_end_date?: string | null;
  autopay?: boolean | null;
  snapshot_data: Record<string, unknown>;
  captured_at: string;
}

export interface CarrierEventDB {
  id: string;
  agent_id: string;
  carrier: CarrierType;
  external_member_id: string;
  client_id?: string | null;
  sync_run_id: string;
  event_type: CarrierEventType;
  severity: EventSeverityType;
  previous_value?: unknown;
  current_value?: unknown;
  created_at: string;
  acknowledged_at?: string | null;
}

export interface CsvPreviewResult {
  totalRows: number;
  activeCount: number;
  inactiveCount: number;
  gracePeriodCount: number;
  balanceDueCount: number;
  headers: string[];
  missingRequiredHeaders: string[];
  records: NormalizedCarrierRecord[];
}
