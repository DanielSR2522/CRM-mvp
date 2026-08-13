import { supabase } from '@/lib/supabaseClient';
import { HealthPolicy, HealthPolicyNote, HealthPolicyDocumentSection, HealthPolicyDocument, HealthTaxHouseholdMember, HealthPrimaryApplicant } from './types';

/**
 * Fetch the authoritative primary applicant data from client_personal_information and clients.
 */
export async function fetchPrimaryApplicant(clientId: string): Promise<HealthPrimaryApplicant> {
  const { data: client } = await supabase
    .from('clients')
    .select('id, full_name, email, phone')
    .eq('id', clientId)
    .maybeSingle();

  const { data: personalInfo } = await supabase
    .from('client_personal_information')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle();

  return {
    clientId,
    fullName: personalInfo?.full_name || client?.full_name || null,
    dateOfBirth: personalInfo?.date_of_birth || null,
    email: personalInfo?.email || client?.email || null,
    phone: personalInfo?.phone || client?.phone || null,
    gender: personalInfo?.gender || null,
    maritalStatus: personalInfo?.marital_status || null,
    bornInUsa: personalInfo?.born_in_usa ?? null,
    usCitizen: personalInfo?.born_in_usa === true || personalInfo?.immigration_status === 'Citizen',
    immigrationStatus: personalInfo?.immigration_status || null,
    immigrationCategory: personalInfo?.immigration_category || null,
    immigrationExpirationDate: personalInfo?.immigration_expiration_date || null,
    hasSsn: !!personalInfo?.ssn,
    hasCardNumber: !!personalInfo?.card_number,
    hasUscisNumber: !!personalInfo?.uscis_number,
    hasAlienNumber: !!personalInfo?.alien_number,
    ssn: personalInfo?.ssn || null,
    cardNumber: personalInfo?.card_number || null,
    uscisNumber: personalInfo?.uscis_number || null,
    alienNumber: personalInfo?.alien_number || null,
    coverage: true,
    usesTobacco: false,
    annualIncome: 0
  };
}

/**
 * Update a specific field in client_personal_information (and sync to clients table if applicable).
 */
export async function updatePrimaryApplicantField(clientId: string, field: string, value: any): Promise<void> {
  const { error: subError } = await supabase
    .from('client_personal_information')
    .upsert({
      client_id: clientId,
      [field]: value,
      updated_at: new Date().toISOString()
    }, { onConflict: 'client_id' });

  if (subError) throw subError;

  if (['full_name', 'email', 'phone'].includes(field)) {
    const masterField = field === 'full_name' ? 'full_name' : field;
    await supabase
      .from('clients')
      .update({
        [masterField]: value,
        updated_at: new Date().toISOString()
      })
      .eq('id', clientId);
  }
}

/**
 * Update a specific field in client_residence_information (and sync address to clients table).
 */
export async function updateClientResidenceField(clientId: string, field: string, value: any): Promise<void> {
  const { error: subError } = await supabase
    .from('client_residence_information')
    .upsert({
      client_id: clientId,
      [field]: value,
      updated_at: new Date().toISOString()
    }, { onConflict: 'client_id' });

  if (subError) throw subError;

  if (field === 'address') {
    await supabase
      .from('clients')
      .update({
        address: value,
        updated_at: new Date().toISOString()
      })
      .eq('id', clientId);
  }
}


export interface ClientResidenceData {
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  county: string | null;
}

export async function fetchClientResidence(clientId: string): Promise<ClientResidenceData> {
  const { data: residence } = await supabase
    .from('client_residence_information')
    .select('address, city, state, zip_code, county')
    .eq('client_id', clientId)
    .maybeSingle();

  if (residence && residence.zip_code) {
    return {
      address: residence.address || null,
      city: residence.city || null,
      state: residence.state || null,
      zipCode: residence.zip_code || null,
      county: residence.county || null
    };
  }

  const { data: client } = await supabase
    .from('clients')
    .select('address')
    .eq('id', clientId)
    .maybeSingle();

  let extractedZip: string | null = null;
  if (client?.address) {
    const match = client.address.match(/\b\d{5}\b/);
    if (match) extractedZip = match[0];
  }

  return {
    address: client?.address || null,
    city: null,
    state: null,
    zipCode: extractedZip,
    county: null
  };
}

/**
 * Fetch total calculated household income from client_income_information records.
 */
export async function fetchTotalHouseholdIncome(clientId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('client_income_information')
    .select('income')
    .eq('client_id', clientId);

  if (error || !data || data.length === 0) return null;

  let total = 0;
  let hasValidIncome = false;

  for (const row of data) {
    if (row.income !== null && row.income !== undefined) {
      const val = Number(row.income);
      if (!isNaN(val) && val > 0) {
        total += val;
        hasValidIncome = true;
      }
    }
  }

  return hasValidIncome ? Math.round(total * 100) / 100 : null;
}

/**
 * Fetch a single health policy for a client.
 * Returns the record directly as the database holds has_* flags.
 */
export async function fetchHealthPolicy(clientId: string): Promise<HealthPolicy | null> {
  const { data, error } = await supabase
    .from('health_policies')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return data as HealthPolicy;
}

/**
 * Save standard fields of the health policy.
 * Returns the upserted row.
 */
export async function saveHealthPolicy(clientId: string, payload: Record<string, unknown>): Promise<HealthPolicy> {
  // Explicitly delete secret indicators to verify they are updated only through the server route
  const cleanPayload = { ...payload };
  delete cleanPayload.has_user_name;
  delete cleanPayload.has_password_val;
  delete cleanPayload.has_security_question;
  delete cleanPayload.has_company_user;
  delete cleanPayload.has_company_password;

  const { data, error } = await supabase
    .from('health_policies')
    .upsert({
      client_id: clientId,
      ...cleanPayload,
      updated_at: new Date().toISOString()
    }, { onConflict: 'client_id' })
    .select('*')
    .single();

  if (error) throw error;

  return data as HealthPolicy;
}

/**
 * Directly update tax household member count on the health policy.
 */
export async function updateHealthPolicyTaxHouseholdCount(
  healthPolicyId: string,
  count: number
): Promise<void> {
  const { error } = await supabase
    .from('health_policies')
    .update({
      number_of_people_on_tax_return: count,
      updated_at: new Date().toISOString()
    })
    .eq('id', healthPolicyId);

  if (error) throw error;
}

/**
 * Update applied Marketplace plan fields directly on an existing health policy.
 * Performs a partial update on the policy row identified by healthPolicyId.
 */
export async function updateAppliedMarketplacePlan(
  healthPolicyId: string,
  payload: {
    company_2026?: string | null;
    type_plan?: string | null;
    plan_id?: string | null;
    plan_name?: string | null;
    plan_cost?: number;
    tax_credit?: number;
    year_renovation?: number | null;
  }
): Promise<HealthPolicy> {
  const { data, error } = await supabase
    .from('health_policies')
    .update({
      ...payload,
      updated_at: new Date().toISOString()
    })
    .eq('id', healthPolicyId)
    .select('*')
    .single();

  if (error) throw error;
  return data as HealthPolicy;
}

/**
 * Save a single sensitive field securely via the server-side API.
 */
export async function saveHealthSecret(
  healthPolicyId: string,
  fieldName: string,
  value: string
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  const res = await fetch(`/api/health-policies/${healthPolicyId}/secrets`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ fieldName, value })
  });

  if (!res.ok) {
    const errData = await res.json();
    throw new Error(errData.error || 'Failed to save secret');
  }
}

/**
 * Fetch a decrypted sensitive field securely via the server-side API.
 */
export async function revealHealthSecret(
  healthPolicyId: string,
  fieldName: string
): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  const res = await fetch(`/api/health-policies/${healthPolicyId}/secrets?field=${fieldName}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${session.access_token}`
    }
  });

  if (!res.ok) {
    const errData = await res.json();
    throw new Error(errData.error || 'Failed to reveal secret');
  }

  const data = await res.json();
  return data.value;
}

// --- Notes Helpers ---
export async function fetchHealthNotes(healthPolicyId: string): Promise<HealthPolicyNote[]> {
  const { data, error } = await supabase
    .from('health_policy_notes')
    .select('*')
    .eq('health_policy_id', healthPolicyId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!data || data.length === 0) return [];

  const authorIds = Array.from(new Set(data.map(n => n.author_id).filter(Boolean)));
  const profileMap: Record<string, { name: string | null; email: string | null }> = {};
  if (authorIds.length > 0) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, name, email')
      .in('id', authorIds);
    if (profs) {
      profs.forEach((p: any) => {
        profileMap[p.id] = { name: p.name, email: p.email };
      });
    }
  }

  return data.map(n => ({
    ...n,
    profiles: profileMap[n.author_id] || null
  })) as HealthPolicyNote[];
}

// --- Documents Helpers ---
export async function fetchHealthSections(healthPolicyId: string): Promise<HealthPolicyDocumentSection[]> {
  const { data, error } = await supabase
    .from('health_policy_document_sections')
    .select('*')
    .eq('health_policy_id', healthPolicyId)
    .order('position', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function fetchHealthDocuments(healthPolicyId: string): Promise<HealthPolicyDocument[]> {
  const { data, error } = await supabase
    .from('health_policy_documents')
    .select('*')
    .eq('health_policy_id', healthPolicyId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

// --- Tax Household Members Helpers ---
export async function fetchTaxHouseholdMembers(healthPolicyId: string): Promise<HealthTaxHouseholdMember[]> {
  const { data, error } = await supabase
    .from('health_tax_household_members')
    .select('*')
    .eq('health_policy_id', healthPolicyId)
    .order('member_number', { ascending: true });

  if (error) throw error;

  return ((data as any[]) || []).map(row => ({
    id: row.id,
    health_policy_id: row.health_policy_id,
    member_number: row.member_number,
    coverage: !!row.coverage,
    full_name: row.full_name || '',
    date_of_birth: row.date_of_birth ? row.date_of_birth.split('T')[0] : null,
    relationship_to_applicant: row.relationship_to_applicant || 'Spouse',
    gender: row.gender || 'Male',
    us_citizen: row.us_citizen !== false,
    uses_tobacco: !!row.uses_tobacco,
    annual_income: row.annual_income !== null && row.annual_income !== undefined ? Number(row.annual_income) : 0,
    income_type: row.income_type || '',
    employer_name: row.employer_name || '',
    employer_phone: row.employer_phone || '',
    immigration_status: row.immigration_status || '',
    immigration_category: row.immigration_category || null,
    immigration_expiration_date: row.immigration_expiration_date ? row.immigration_expiration_date.split('T')[0] : null,
    ssn_encrypted: row.ssn_encrypted,
    immigration_card_number_encrypted: row.immigration_card_number_encrypted,
    immigration_uscis_number_encrypted: row.immigration_uscis_number_encrypted,
    immigration_alien_number_encrypted: row.immigration_alien_number_encrypted,
    has_ssn: !!row.ssn_encrypted,
    has_card_number: !!row.immigration_card_number_encrypted,
    has_uscis_number: !!row.immigration_uscis_number_encrypted,
    has_alien_number: !!row.immigration_alien_number_encrypted,
    created_at: row.created_at,
    updated_at: row.updated_at
  }));
}

export async function upsertTaxHouseholdMember(
  healthPolicyId: string,
  member: HealthTaxHouseholdMember
): Promise<HealthTaxHouseholdMember> {
  const payload: any = {
    health_policy_id: healthPolicyId,
    member_number: member.member_number,
    coverage: member.coverage !== false,
    full_name: (member.full_name || '').trim(),
    date_of_birth: member.date_of_birth ? member.date_of_birth.split('T')[0] : null,
    relationship_to_applicant: member.relationship_to_applicant || 'Spouse',
    gender: member.gender || 'Male',
    us_citizen: member.us_citizen !== false,
    uses_tobacco: !!member.uses_tobacco,
    annual_income: typeof member.annual_income === 'number' ? member.annual_income : 0,
    income_type: member.income_type || null,
    employer_name: member.employer_name || null,
    employer_phone: member.employer_phone || null,
    immigration_status: member.immigration_status || null,
    immigration_category: member.immigration_category || null,
    immigration_expiration_date: member.immigration_expiration_date ? member.immigration_expiration_date.split('T')[0] : null,
    updated_at: new Date().toISOString()
  };

  if (member.id) {
    payload.id = member.id;
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log('[TAX_MEMBER_UPSERT_PAYLOAD]', {
      healthPolicyId,
      memberNumber: member.member_number,
      hasId: !!member.id,
      keys: Object.keys(payload)
    });
  }

  const { data, error } = await supabase
    .from('health_tax_household_members')
    .upsert(payload, { onConflict: 'health_policy_id,member_number' })
    .select('*')
    .single();

  if (error) {
    console.error('[TAX_MEMBER_UPSERT_ERROR]', {
      healthPolicyId,
      memberNumber: member.member_number,
      error: error.message
    });
    throw error;
  }

  return data as HealthTaxHouseholdMember;
}

export async function deleteTaxHouseholdMembers(
  healthPolicyId: string,
  memberNumbers: number[]
): Promise<void> {
  if (!memberNumbers || memberNumbers.length === 0) return;

  const { error } = await supabase
    .from('health_tax_household_members')
    .delete()
    .eq('health_policy_id', healthPolicyId)
    .in('member_number', memberNumbers);

  if (error) throw error;
}

export async function revealTaxMemberSecret(
  healthPolicyId: string,
  memberNumber: number,
  fieldName: string
): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  const res = await fetch(
    `/api/health-policies/${healthPolicyId}/tax-members/secrets?memberNumber=${memberNumber}&field=${fieldName}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      }
    }
  );

  if (!res.ok) {
    const errData = await res.json();
    throw new Error(errData.error || 'Failed to reveal secret');
  }

  const data = await res.json();
  return data.value;
}

export async function saveTaxMemberSecret(
  healthPolicyId: string,
  memberNumber: number,
  fieldName: string,
  value: string
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  const res = await fetch(`/api/health-policies/${healthPolicyId}/tax-members/secrets`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ memberNumber, fieldName, value })
  });

  if (!res.ok) {
    const errData = await res.json();
    throw new Error(errData.error || 'Failed to save secret');
  }
}

/**
 * Updates specific top-level fields on a HealthPolicy record (e.g. policy_status, action_pending)
 */
export async function updateHealthPolicyField(
  policyId: string,
  patch: Partial<HealthPolicy>
): Promise<HealthPolicy> {
  const { data, error } = await supabase
    .from('health_policies')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', policyId)
    .select('*')
    .single();

  if (error || !data) {
    throw error || new Error('Failed to update Health Policy.');
  }

  return data as HealthPolicy;
}

/**
 * Fetch all medical items for a Health policy
 */
export async function fetchHealthMedicalData(healthPolicyId: string) {
  const [
    doctorsRes,
    hospitalsRes,
    urgentCaresRes,
    pharmaciesRes,
    conditionsRes,
    specialistsRes,
    medicationsRes,
  ] = await Promise.all([
    supabase.from('client_health_doctors').select('*').eq('health_policy_id', healthPolicyId).order('created_at', { ascending: true }),
    supabase.from('client_health_hospitals').select('*').eq('health_policy_id', healthPolicyId).order('created_at', { ascending: true }),
    supabase.from('client_health_urgent_cares').select('*').eq('health_policy_id', healthPolicyId).order('created_at', { ascending: true }),
    supabase.from('client_health_pharmacies').select('*').eq('health_policy_id', healthPolicyId).order('created_at', { ascending: true }),
    supabase.from('client_health_conditions').select('*').eq('health_policy_id', healthPolicyId).order('created_at', { ascending: true }),
    supabase.from('client_health_specialists').select('*').eq('health_policy_id', healthPolicyId).order('created_at', { ascending: true }),
    supabase.from('client_health_medications').select('*').eq('health_policy_id', healthPolicyId).order('created_at', { ascending: true }),
  ]);

  return {
    doctors: doctorsRes.data || [],
    hospitals: hospitalsRes.data || [],
    urgentCares: urgentCaresRes.data || [],
    pharmacies: pharmaciesRes.data || [],
    conditions: conditionsRes.data || [],
    specialists: specialistsRes.data || [],
    medications: medicationsRes.data || [],
  };
}

export async function syncHealthPolicyMedicalSummaries(healthPolicyId: string): Promise<void> {
  const data = await fetchHealthMedicalData(healthPolicyId);
  const primaryDoctor = data.doctors[0]?.doctor_name || null;
  const primaryDoctorAddress = data.doctors[0]?.address || null;
  const primaryDoctorPhone = data.doctors[0]?.phone || null;
  const hospital = data.hospitals.map((h: { hospital_name: string }) => h.hospital_name).join(', ') || null;
  const urgentCare = data.urgentCares.map((u: { urgent_care_name: string }) => u.urgent_care_name).join(', ') || null;
  const pharmacy = data.pharmacies.map((p: { pharmacy_name: string }) => p.pharmacy_name).join(', ') || null;
  const conditions = data.conditions.map((c: { condition_name: string }) => c.condition_name).join(', ') || null;
  const medicines = data.medications.map((m: { medication_name: string }) => m.medication_name).join(', ') || null;
  const specialist = data.specialists.map((s: { specialist_name: string }) => s.specialist_name).join(', ') || null;

  await supabase
    .from('health_policies')
    .update({
      primary_doctor: primaryDoctor,
      primary_doctor_address: primaryDoctorAddress,
      primary_doctor_phone: primaryDoctorPhone,
      hospital,
      urgent_care: urgentCare,
      pharmacy,
      conditions,
      medicines,
      specialist,
      updated_at: new Date().toISOString(),
    })
    .eq('id', healthPolicyId);
}
