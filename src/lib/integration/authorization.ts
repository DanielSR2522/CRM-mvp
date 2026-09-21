import type { SupabaseClient } from '@supabase/supabase-js';

export interface ClientAccessResult {
  authorized: boolean;
  reason?: 'actor_not_found' | 'client_not_found' | 'unauthorized';
  client?: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    city: string | null;
    agent_id: string | null;
  };
}

/**
 * Validates whether actorWinterfellProfileId is authorized to access clientId
 * according to Winterfell's canonical rules:
 * 1. Admin profile role
 * 2. Directly assigned agent (clients.agent_id === actorWinterfellProfileId)
 * 3. Shared agent access via public.agent_shared_access pair link
 */
export async function authorizeClientAccess(
  adminDb: SupabaseClient,
  actorWinterfellProfileId: string,
  clientId: string
): Promise<ClientAccessResult> {
  // 1. Verify actor profile
  const { data: profile } = await adminDb
    .from('profiles')
    .select('id, role')
    .eq('id', actorWinterfellProfileId)
    .maybeSingle();

  if (!profile) {
    return { authorized: false, reason: 'actor_not_found' };
  }

  // 2. Fetch client record
  const { data: client, error: clientErr } = await adminDb
    .from('clients')
    .select('id, full_name, email, phone, city, agent_id')
    .eq('id', clientId)
    .maybeSingle();

  if (clientErr || !client) {
    return { authorized: false, reason: 'client_not_found' };
  }

  // 3. Admin access
  if (profile.role === 'admin') {
    return { authorized: true, client };
  }

  // 4. Directly assigned agent access
  if (client.agent_id && client.agent_id === actorWinterfellProfileId) {
    return { authorized: true, client };
  }

  // 5. Shared agent access check via agent_shared_access
  if (client.agent_id) {
    const { data: sharedRows } = await adminDb
      .from('agent_shared_access')
      .select('agent_id, shared_agent_id')
      .or(`agent_id.eq.${actorWinterfellProfileId},shared_agent_id.eq.${actorWinterfellProfileId}`);

    const hasSharedAccess = (sharedRows || []).some(
      (row) =>
        (row.agent_id === actorWinterfellProfileId && row.shared_agent_id === client.agent_id) ||
        (row.shared_agent_id === actorWinterfellProfileId && row.agent_id === client.agent_id)
    );

    if (hasSharedAccess) {
      return { authorized: true, client };
    }
  }

  return { authorized: false, reason: 'unauthorized', client };
}
