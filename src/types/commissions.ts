export type MatchStatus = 'MATCHED' | 'REVIEW' | 'UNMATCHED';
export type PaymentStatus = 'PAID' | 'PENDING' | 'NEEDS_REVIEW' | 'VOID';

export interface ExtractedCommissionRow {
  id: string;
  payment_date: string;
  client_name: string;
  membership_or_policy_number: string;
  carrier: string;
  transaction_code?: string;
  commission_amount: number;
  confidence: number;
  confidence_reason?: string;
  warnings?: string[];
  raw_text?: string;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
  match_status: MatchStatus;
  matched_client_id?: string;
  matched_client_name?: string;
  matched_agent_name?: string;
  matched_policy_id?: string;
  matched_policy_number?: string;
  matched_carrier?: string;
  matched_effective_date?: string;
  matched_premium_amount?: number;
}

export interface StructuredExtractionResult {
  document_type: 'structured_table' | 'whatsapp_chat' | 'statement_photo' | 'pdf_document' | 'unknown';
  rows: ExtractedCommissionRow[];
  document_warnings: string[];
  extraction_method: 'vision_ai' | 'ocr_fallback';
}

export type LedgerStatus = 'Pending payment' | 'Review' | 'Paid' | 'Unmatched' | 'Imported' | 'Matched' | 'Confirmed' | 'Reconciled';

export interface PendingPolicy {
  policy_id: string;
  client_id: string;
  client_name: string;
  policy_number: string;
  carrier: string;
  agent_id?: string;
  agent_name?: string;
  policy_type: string;
  effective_date: string;
  days_pending: number;
  status: 'Pending payment';
}

export interface CommissionPayment {
  id: string;
  agent_id: string;
  agent_name?: string;
  client_id: string;
  client_name?: string;
  policy_id: string;
  policy_number: string;
  carrier: string;
  policy_type?: string;
  effective_date?: string;
  premium_amount?: number;
  amount: number;
  payment_date: string;
  transaction_code?: string;
  extraction_method?: 'vision_ai' | 'ocr_fallback';
  extraction_confidence?: number;
  match_status?: MatchStatus;
  status: LedgerStatus;
  source_document_url?: string | null;
  source_text?: string | null;
  original_extracted_value?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface DuplicateWarning {
  is_duplicate: boolean;
  existing_payment_id?: string;
  message?: string;
}

