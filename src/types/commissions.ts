export type MatchStatus = 'MATCHED' | 'NEEDS_REVIEW' | 'NOT_FOUND';
export type PaymentStatus = 'PAID' | 'PENDING' | 'NEEDS_REVIEW' | 'VOID';

export interface ExtractedCommissionRow {
  id: string;
  payment_date: string;
  client_name: string;
  policy_or_membership_number: string;
  carrier: string;
  commission_amount: number;
  raw_text: string;
  match_status: MatchStatus;
  matched_client_id?: string;
  matched_client_name?: string;
  matched_policy_id?: string;
  matched_policy_number?: string;
  matched_carrier?: string;
  confidence_score?: number;
}

export interface CommissionPayment {
  id: string;
  agent_id: string;
  client_id: string;
  policy_id: string;
  policy_number: string;
  carrier: string;
  amount: number;
  payment_date: string;
  status: PaymentStatus;
  source_document_url?: string | null;
  source_text?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at?: string;
  client_name?: string;
}

export interface DuplicateWarning {
  is_duplicate: boolean;
  existing_payment_id?: string;
  message?: string;
}
