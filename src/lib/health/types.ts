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
  number_of_people_on_tax_return?: number | null;
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

export interface HealthPrimaryApplicant {
  clientId: string;
  fullName: string | null;
  dateOfBirth: string | null;
  email: string | null;
  phone: string | null;
  gender: string | null;
  maritalStatus: string | null;
  bornInUsa: boolean | null;
  usCitizen: boolean | null;
  immigrationStatus: string | null;
  immigrationCategory: string | null;
  immigrationExpirationDate: string | null;
  alienNumber?: string | null;
  cardNumber?: string | null;
  uscisNumber?: string | null;
  ssn?: string | null;
  hasSsn: boolean;
  hasCardNumber: boolean;
  hasUscisNumber: boolean;
  hasAlienNumber: boolean;
  coverage: boolean;
  usesTobacco?: boolean | null;
  annualIncome?: number | null;
}

export interface HealthTaxHouseholdMember {
  id?: string;
  health_policy_id: string;
  member_number: number;
  coverage: boolean;
  full_name: string;
  date_of_birth: string | null;
  relationship_to_applicant: 'Spouse' | 'Son' | 'Daughter' | 'Child' | 'Stepchild' | 'Parent' | 'Sibling' | 'Domestic Partner' | 'Other Dependent' | 'Other' | string;
  gender?: 'Male' | 'Female' | 'Other' | '' | string;
  us_citizen?: boolean;
  uses_tobacco?: boolean;
  annual_income?: number | null;
  income_type?: string | null;
  employer_name?: string | null;
  employer_phone?: string | null;
  immigration_status: 'Resident' | 'Work Permit' | 'Citizen' | 'Other' | '' | string;
  immigration_category?: string | null;
  immigration_expiration_date?: string | null;
  
  ssn_encrypted?: string | null;
  immigration_card_number_encrypted?: string | null;
  immigration_uscis_number_encrypted?: string | null;
  immigration_alien_number_encrypted?: string | null;

  // Mask / secret flags
  has_ssn?: boolean;
  has_card_number?: boolean;
  has_uscis_number?: boolean;
  has_alien_number?: boolean;

  created_at?: string;
  updated_at?: string;
}
