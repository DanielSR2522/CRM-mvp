export type SupplementalProductType =
  | 'Dental'
  | 'Vision'
  | 'Accident'
  | 'Critical Illness'
  | 'Hospital Indemnity'
  | 'Cancer'
  | 'Short-Term Disability'
  | 'Long-Term Disability'
  | 'Other';

export type SupplementalCoverageType =
  | 'Individual'
  | 'Individual & Spouse'
  | 'Family'
  | 'One-Parent Family';

export type SupplementalStatus =
  | 'Active'
  | 'Pending'
  | 'Cancelled'
  | 'Terminated'
  | 'Expired';

export type SupplementalRelationship =
  | 'Self'
  | 'Spouse'
  | 'Child'
  | 'Dependent'
  | 'Other';

export interface SupplementalPolicy {
  id: string;
  client_id: string;
  product_type: SupplementalProductType | string;
  company?: string | null;
  plan_name?: string | null;
  coverage_type?: SupplementalCoverageType | string | null;
  member_id?: string | null;
  monthly_premium?: number | null;
  effective_date?: string | null; // ISO YYYY-MM-DD
  status?: SupplementalStatus | string | null;

  // Beneficiary Information (Additive)
  beneficiary_name?: string | null;
  beneficiary_phone?: string | null;
  beneficiary_birth_date?: string | null; // ISO YYYY-MM-DD

  created_at?: string;
  updated_at?: string;
  covered_members?: SupplementalCoveredMember[];
}

export interface SupplementalCoveredMember {
  id: string;
  policy_id: string;
  full_name: string;
  relationship: SupplementalRelationship | string;
  phone?: string | null;
  birth_date?: string | null; // ISO YYYY-MM-DD
  member_id?: string | null;
  created_at?: string;
  updated_at?: string;
}
