export interface HealthPolicy {
  id: string;
  client_id: string;
  active: boolean;
  year_renovation: number | null;
  policy_status: 'Active' | 'Pending' | 'Cancelled';
  action_pending: 'Documents' | 'Verification' | 'Call To Marketplace' | 'Completed';
  renovation_status: 'New Policy 2026' | 'Renewal 2026' | 'Only Service';
  npn: string | null;
  company_2026: string | null;
  application_number: string | null;
  type_plan: 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Catastrophic' | '';
  marketplace_account: boolean;
  plan_id: string | null;
  plan_name: string | null;
  
  // Encrypted fields flags/masks (returned by standard queries)
  has_user_name: boolean;
  has_password_val: boolean;
  has_security_question: boolean;
  has_company_user: boolean;
  has_company_password: boolean;
  
  no_membership: string | null;
  plan_cost: number;
  tax_credit: number;
  effective_date: string | null;
  coverage_members_count: number | null;
  primary_doctor: string | null;
  primary_doctor_address: string | null;
  primary_doctor_phone: string | null;
  hospital: string | null;
  urgent_care: string | null;
  pharmacy: string | null;
  conditions: string | null;
  medicines: string | null;
  specialist: string | null;
  created_at: string;
  updated_at: string;
}

export interface HealthPolicyNote {
  id: string;
  health_policy_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  profiles?: {
    name: string | null;
    email: string | null;
  } | null;
}

export interface HealthPolicyDocumentSection {
  id: string;
  health_policy_id: string;
  name: string;
  position: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface HealthPolicyDocument {
  id: string;
  health_policy_id: string;
  section_id: string;
  uploaded_by: string;
  display_name: string;
  original_filename: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number;
  created_at: string;
  updated_at: string;
}

export interface HealthPolicyNoteAttachment {
  id: string;
  note_id: string;
  health_policy_id: string;
  uploaded_by: string;
  display_name: string;
  original_filename: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

export interface EncryptedSecretField {
  ciphertext: string;
  iv: string;
  authTag: string;
}
