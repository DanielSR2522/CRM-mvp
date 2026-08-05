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
    .select('*, profiles(name, email)')
    .eq('health_policy_id', healthPolicyId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data as HealthPolicyNote[]) || [];
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
