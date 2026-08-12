export interface ScopeOfAppointmentData {
  scope_of_appointment: boolean | null;
  soa_date: string | null;
  soa_method: string | null;
}

export interface MedicareDetailsData {
  mbi: string | null;
  part_a_effective_date: string | null;
  part_b_effective_date: string | null;
  part_c_subtype: string | null;
  medicaid_level: string | null;
  medicaid_id: string | null;
  renewal_status: string | null;
  company: string | null;
  plan_name: string | null;
  plan_id: string | null;
  plan_effective_date: string | null;
}

export interface MedicareInformationData extends ScopeOfAppointmentData, MedicareDetailsData {
  id?: string;
  client_id: string;
  created_at?: string;
  updated_at?: string;
}

export interface DoctorEntry {
  id: string;
  client_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  specialty: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface HospitalEntry {
  id: string;
  client_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface UrgentCareEntry {
  id: string;
  client_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PharmacyEntry {
  id: string;
  client_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ConditionEntry {
  id: string;
  client_id: string;
  name: string;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SpecialistEntry {
  id: string;
  client_id: string;
  name: string;
  specialty: string | null;
  address: string | null;
  phone: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface MedicationEntry {
  id: string;
  client_id: string;
  name: string;
  dosage: string | null;
  frequency: string | null;
  instructions: string | null;
  created_at?: string;
  updated_at?: string;
}

export type MedicalCategory =
  | 'doctors'
  | 'hospitals'
  | 'urgent_cares'
  | 'pharmacies'
  | 'conditions'
  | 'specialists'
  | 'medications';
