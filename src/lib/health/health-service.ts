import { supabase } from '@/lib/supabaseClient';
import { HealthPolicy, HealthPolicyNote, HealthPolicyDocumentSection, HealthPolicyDocument } from './types';

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
