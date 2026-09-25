import { supabase } from '@/lib/supabaseClient';

export interface AgentNpn {
  id: string;
  agent_id: string;
  npn: string;
  display_name: string | null;
  is_default: boolean;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

/**
 * Formats NPN display string in exact specification: `{npn} - {display_name}`.
 * If display_name is empty or null, returns `{npn}` only.
 */
export function formatAgentNpnLabel(npn: string, displayName?: string | null): string {
  const cleanNpn = (npn || '').trim();
  const cleanName = (displayName || '').trim();
  if (!cleanNpn) return '—';
  if (!cleanName) return cleanNpn;
  return `${cleanNpn} - ${cleanName}`;
}

/**
 * Fetches all authorized NPNs for a given agent.
 * If no NPNs are registered in `agent_npns` yet, auto-initializes from `profiles.npn_number` if present.
 */
export async function fetchAgentNpns(agentId: string): Promise<AgentNpn[]> {
  if (!agentId) return [];

  try {
    const { data, error } = await supabase
      .from('agent_npns')
      .select('*')
      .eq('agent_id', agentId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('Error fetching agent_npns, falling back to profile npn_number:', error);
      return fallbackFromProfile(agentId);
    }

    if (data && data.length > 0) {
      return data as AgentNpn[];
    }

    // Auto-backfill if agent_npns is empty for this agent
    return await fallbackFromProfile(agentId, true);
  } catch (err) {
    console.warn('Unexpected error in fetchAgentNpns:', err);
    return fallbackFromProfile(agentId);
  }
}

async function fallbackFromProfile(agentId: string, shouldCreateInDb: boolean = false): Promise<AgentNpn[]> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('npn_number, first_name, last_name')
      .eq('id', agentId)
      .maybeSingle();

    if (profile?.npn_number) {
      const fallbackNpn: AgentNpn = {
        id: 'default-profile-npn',
        agent_id: agentId,
        npn: profile.npn_number.trim(),
        display_name: 'Primary NPN',
        is_default: true,
        active: true,
      };

      if (shouldCreateInDb) {
        const { data: inserted, error: insertErr } = await supabase
          .from('agent_npns')
          .insert({
            agent_id: agentId,
            npn: profile.npn_number.trim(),
            display_name: 'Primary NPN',
            is_default: true,
            active: true,
          })
          .select()
          .single();

        if (!insertErr && inserted) {
          return [inserted as AgentNpn];
        }
      }

      return [fallbackNpn];
    }
  } catch (e) {
    console.warn('Fallback profile lookup failed:', e);
  }

  return [];
}

/**
 * Adds a new NPN for an agent.
 */
export async function addAgentNpn(
  agentId: string,
  npn: string,
  displayName: string = '',
  isDefault: boolean = false
): Promise<AgentNpn | null> {
  const cleanNpn = npn.trim();
  if (!cleanNpn) throw new Error('NPN number is required');

  if (isDefault) {
    await supabase
      .from('agent_npns')
      .update({ is_default: false })
      .eq('agent_id', agentId);
  }

  const { data, error } = await supabase
    .from('agent_npns')
    .insert({
      agent_id: agentId,
      npn: cleanNpn,
      display_name: displayName.trim() || null,
      is_default: isDefault,
      active: true,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message || 'Failed to add NPN');
  }

  return data as AgentNpn;
}

/**
 * Updates an existing NPN record.
 */
export async function updateAgentNpn(
  id: string,
  agentId: string,
  updates: Partial<Pick<AgentNpn, 'npn' | 'display_name' | 'is_default' | 'active'>>
): Promise<void> {
  if (updates.is_default) {
    await supabase
      .from('agent_npns')
      .update({ is_default: false })
      .eq('agent_id', agentId);
  }

  const payload: any = { ...updates };
  if (payload.npn !== undefined) payload.npn = payload.npn.trim();
  if (payload.display_name !== undefined) payload.display_name = payload.display_name?.trim() || null;

  const { error } = await supabase
    .from('agent_npns')
    .update(payload)
    .eq('id', id);

  if (error) {
    throw new Error(error.message || 'Failed to update NPN');
  }
}

/**
 * Sets a specific NPN as the default for an agent.
 */
export async function setDefaultAgentNpn(agentId: string, npnId: string): Promise<void> {
  await supabase
    .from('agent_npns')
    .update({ is_default: false })
    .eq('agent_id', agentId);

  const { error } = await supabase
    .from('agent_npns')
    .update({ is_default: true })
    .eq('id', npnId);

  if (error) {
    throw new Error(error.message || 'Failed to set default NPN');
  }
}

/**
 * Deletes an NPN entry.
 */
export async function deleteAgentNpn(id: string): Promise<void> {
  const { error } = await supabase
    .from('agent_npns')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(error.message || 'Failed to delete NPN');
  }
}
