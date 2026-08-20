import { supabase } from '@/lib/supabaseClient';
import {
  UnifiedNote,
  NoteAttachment,
  PendingAttachment,
  CreateNotePayload,
  NoteCategory
} from './types';

/**
 * Helper to resolve profiles for a batch of created_by UUIDs
 */
async function resolveNoteProfiles(creatorIds: string[]): Promise<Record<string, { id: string; name: string; email: string | null }>> {
  if (creatorIds.length === 0) return {};

  const profileMap: Record<string, { id: string; name: string; email: string | null }> = {};
  try {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, name, email')
      .in('id', creatorIds);

    if (profs) {
      profs.forEach((p: any) => {
        const firstLast = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
        const displayName = firstLast || (p.name && p.name.trim()) || (p.email && p.email.trim()) || 'Agent';
        profileMap[p.id] = {
          id: p.id,
          name: displayName,
          email: p.email || null
        };
      });
    }
  } catch (err) {
    console.error('Error resolving note profiles:', err);
  }

  return profileMap;
}

/**
 * Helper to resolve policies for a batch of policy_id and health_policy_id UUIDs
 */
async function resolveNotePolicies(
  policyIds: string[],
  healthPolicyIds: string[] = []
): Promise<Record<string, { id: string; policy_number: string | null; policy_type: string | null; writing_company: string | null; company_name: string | null; isHealth?: boolean }>> {
  const policyMap: Record<string, any> = {};

  try {
    // 1. Check P&C / Life / Supplemental policies table
    if (policyIds.length > 0) {
      const { data: pcPolicies } = await supabase
        .from('policies')
        .select('id, policy_number, policy_type, writing_company, company_name')
        .in('id', policyIds);

      if (pcPolicies) {
        pcPolicies.forEach((p: any) => {
          policyMap[p.id] = {
            ...p,
            isHealth: false
          };
        });
      }
    }

    // 2. Check health_policies table
    if (healthPolicyIds.length > 0) {
      const { data: healthPolicies } = await supabase
        .from('health_policies')
        .select('id, plan_id, plan_name, company_2026, application_number')
        .in('id', healthPolicyIds);

      if (healthPolicies) {
        healthPolicies.forEach((hp: any) => {
          policyMap[hp.id] = {
            id: hp.id,
            policy_number: hp.plan_id || hp.application_number || null,
            policy_type: hp.plan_name || 'Health Plan',
            writing_company: hp.company_2026 || 'Marketplace Health',
            company_name: hp.company_2026 || 'Marketplace Health',
            isHealth: true
          };
        });
      }
    }
  } catch (err) {
    console.error('Error resolving note policies:', err);
  }

  return policyMap;
}

/**
 * Fetch all client notes for a given client, optionally filtered by category, policyId, or healthPolicyId.
 */
export async function fetchClientNotes(
  clientId: string,
  categoryFilter?: NoteCategory | 'all' | null,
  policyIdFilter?: string | null,
  healthPolicyIdFilter?: string | null
): Promise<UnifiedNote[]> {
  try {
    let query = supabase
      .from('client_notes')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (categoryFilter && categoryFilter !== 'all') {
      query = query.eq('category', categoryFilter);
    }

    if (healthPolicyIdFilter) {
      query = query.eq('health_policy_id', healthPolicyIdFilter);
    } else if (policyIdFilter) {
      query = query.eq('policy_id', policyIdFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching client_notes:', error);
      return fetchFallbackPolicyNotes(clientId, categoryFilter, policyIdFilter);
    }

    const rawNotes = (data as any[]) || [];
    if (rawNotes.length === 0) return [];

    // Shared agents (non-owner) can strictly only access property_casualty notes
    const { data: { session } } = await supabase.auth.getSession();
    const currentUserId = session?.user?.id;
    const { data: clientInfo } = await supabase.from('clients').select('agent_id').eq('id', clientId).maybeSingle();

    const accessibleNotes = rawNotes.filter(n => {
      if (!clientInfo?.agent_id || !currentUserId) return true;
      if (clientInfo.agent_id === currentUserId) return true;
      return n.category === 'property_casualty';
    });

    if (accessibleNotes.length === 0) return [];

    const creatorIds = Array.from(new Set(accessibleNotes.map(n => n.created_by).filter(Boolean)));
    const policyIds = Array.from(new Set(accessibleNotes.map(n => n.policy_id).filter(Boolean)));
    const healthPolicyIds = Array.from(new Set(accessibleNotes.map(n => n.health_policy_id).filter(Boolean)));

    const [profileMap, policyMap] = await Promise.all([
      resolveNoteProfiles(creatorIds),
      resolveNotePolicies(policyIds, healthPolicyIds)
    ]);

    return accessibleNotes.map(note => {
      const activePolicyId = note.health_policy_id || note.policy_id;
      return {
        ...note,
        profiles: note.created_by ? profileMap[note.created_by] || null : null,
        policies: activePolicyId ? policyMap[activePolicyId] || null : null
      };
    });
  } catch (err) {
    console.error('Unexpected error in fetchClientNotes:', err);
    return fetchFallbackPolicyNotes(clientId, categoryFilter, policyIdFilter);
  }
}

/**
 * Fallback loader for historical policy_notes table if client_notes table is not present.
 */
async function fetchFallbackPolicyNotes(
  clientId: string,
  categoryFilter?: NoteCategory | 'all' | null,
  policyIdFilter?: string | null
): Promise<UnifiedNote[]> {
  try {
    let query = supabase
      .from('policy_notes')
      .select('*')
      .order('created_at', { ascending: false });

    if (policyIdFilter) {
      query = query.eq('policy_id', policyIdFilter);
    }

    const { data, error } = await query;
    if (error || !data || data.length === 0) return [];

    const authorIds = Array.from(new Set(data.map((item: any) => item.author_id).filter(Boolean)));
    const policyIds = Array.from(new Set(data.map((item: any) => item.policy_id).filter(Boolean)));

    const [profileMap, policyMap] = await Promise.all([
      resolveNoteProfiles(authorIds),
      resolveNotePolicies(policyIds, [])
    ]);

    return data
      .map((item: any) => {
        const policyObj = item.policy_id ? policyMap[item.policy_id] : null;
        const pType = policyObj?.policy_type?.toLowerCase() || '';
        let cat: NoteCategory = 'property_casualty';
        if (pType.includes('health')) cat = 'health';
        else if (pType.includes('life')) cat = 'life';

        return {
          id: item.id,
          client_id: clientId,
          category: cat,
          policy_id: item.policy_id,
          health_policy_id: null,
          content: item.content,
          created_by: item.author_id,
          created_at: item.created_at,
          updated_at: item.updated_at || item.created_at,
          profiles: item.author_id ? profileMap[item.author_id] || null : null,
          policies: policyObj || null
        };
      })
      .filter(n => !categoryFilter || categoryFilter === 'all' || n.category === categoryFilter);
  } catch (err) {
    return [];
  }
}

/**
 * Fetch attachments for a set of note IDs.
 */
export async function fetchNoteAttachments(noteIds: string[]): Promise<{ [noteId: string]: NoteAttachment[] }> {
  if (noteIds.length === 0) return {};
  try {
    const { data, error } = await supabase
      .from('client_note_attachments')
      .select('*')
      .in('note_id', noteIds)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching client_note_attachments:', error);
      return fetchFallbackNoteAttachments(noteIds);
    }

    const grouped: { [noteId: string]: NoteAttachment[] } = {};
    (data || []).forEach((att: any) => {
      if (!grouped[att.note_id]) grouped[att.note_id] = [];
      grouped[att.note_id].push(att);
    });
    return grouped;
  } catch (err) {
    console.error('Unexpected error in fetchNoteAttachments:', err);
    return fetchFallbackNoteAttachments(noteIds);
  }
}

async function fetchFallbackNoteAttachments(noteIds: string[]): Promise<{ [noteId: string]: NoteAttachment[] }> {
  try {
    const { data, error } = await supabase
      .from('policy_note_attachments')
      .select('*')
      .in('note_id', noteIds);
    if (error || !data) return {};

    const grouped: { [noteId: string]: NoteAttachment[] } = {};
    data.forEach((att: any) => {
      if (!grouped[att.note_id]) grouped[att.note_id] = [];
      grouped[att.note_id].push(att);
    });
    return grouped;
  } catch (err) {
    return {};
  }
}

/**
 * Get a temporary signed URL for viewing/downloading an attachment.
 */
export async function getAttachmentSignedUrl(storagePath: string): Promise<string | null> {
  try {
    // Try policy-documents bucket first
    let { data, error } = await supabase.storage.from('policy-documents').createSignedUrl(storagePath, 600);
    if (error || !data?.signedUrl) {
      // Try health-policy-documents fallback
      const fallback = await supabase.storage.from('health-policy-documents').createSignedUrl(storagePath, 600);
      data = fallback.data;
    }
    return data?.signedUrl || null;
  } catch (err) {
    console.error('Error getting signed URL:', err);
    return null;
  }
}

/**
 * Create a new unified note record with client ownership security check.
 */
export async function createClientNote(payload: CreateNotePayload): Promise<UnifiedNote> {
  // Security ownership validation
  if (payload.policyId) {
    const { data: pCheck, error: pErr } = await supabase
      .from('policies')
      .select('client_id')
      .eq('id', payload.policyId)
      .single();

    if (pErr || !pCheck || pCheck.client_id !== payload.clientId) {
      throw new Error('Security error: Selected policy does not belong to this client.');
    }
  }

  if (payload.healthPolicyId) {
    const { data: hCheck, error: hErr } = await supabase
      .from('health_policies')
      .select('client_id')
      .eq('id', payload.healthPolicyId)
      .single();

    if (hErr || !hCheck || hCheck.client_id !== payload.clientId) {
      throw new Error('Security error: Selected Health policy does not belong to this client.');
    }
  }

  // Enforce exclusivity: policy_id OR health_policy_id, never both
  const insertPayload = {
    client_id: payload.clientId,
    category: payload.category,
    policy_id: payload.policyId ? payload.policyId : null,
    health_policy_id: payload.healthPolicyId ? payload.healthPolicyId : null,
    title: payload.title || null,
    content: payload.content.trim(),
    created_by: payload.createdBy || null
  };

  const { data, error } = await supabase
    .from('client_notes')
    .insert(insertPayload)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to create note: ${error.message}`);
  }

  const rawNote = data as any;

  // Resolve author profile & policy info
  const creatorId = rawNote.created_by ? [rawNote.created_by] : [];
  const policyId = rawNote.policy_id ? [rawNote.policy_id] : [];
  const healthPolicyId = rawNote.health_policy_id ? [rawNote.health_policy_id] : [];

  const [profileMap, policyMap] = await Promise.all([
    resolveNoteProfiles(creatorId),
    resolveNotePolicies(policyId, healthPolicyId)
  ]);

  const activePolicyId = rawNote.health_policy_id || rawNote.policy_id;

  return {
    ...rawNote,
    profiles: rawNote.created_by ? profileMap[rawNote.created_by] || null : null,
    policies: activePolicyId ? policyMap[activePolicyId] || null : null
  };
}

/**
 * Update an existing note content.
 */
export async function updateClientNote(noteId: string, content: string): Promise<void> {
  const { error } = await supabase
    .from('client_notes')
    .update({ content: content.trim(), updated_at: new Date().toISOString() })
    .eq('id', noteId);

  if (error) {
    throw new Error(`Failed to update note: ${error.message}`);
  }
}

/**
 * Delete a note and its attached files.
 */
export async function deleteClientNote(noteId: string): Promise<void> {
  const { error } = await supabase
    .from('client_notes')
    .delete()
    .eq('id', noteId);

  if (error) {
    throw new Error(`Failed to delete note: ${error.message}`);
  }
}

/**
 * Upload attachments for a created note.
 */
export async function uploadNoteAttachments(
  noteId: string,
  clientId: string,
  uploadedBy: string | null,
  pendingList: PendingAttachment[]
): Promise<NoteAttachment[]> {
  const uploaded: NoteAttachment[] = [];

  for (const pending of pendingList) {
    const file = pending.file;
    const fileExt = file.name.split('.').pop();
    const cleanFileName = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
    const storagePath = `${clientId}/notes/${noteId}/${cleanFileName}`;

    // Upload to policy-documents storage bucket
    const { error: uploadError } = await supabase.storage
      .from('policy-documents')
      .upload(storagePath, file, { contentType: file.type, upsert: true });

    if (uploadError) {
      console.error('Failed to upload note attachment file:', uploadError);
      continue;
    }

    // Insert database attachment metadata record
    const { data: dbAtt, error: dbErr } = await supabase
      .from('client_note_attachments')
      .insert({
        note_id: noteId,
        client_id: clientId,
        uploaded_by: uploadedBy,
        display_name: pending.displayName || file.name,
        original_filename: file.name,
        storage_path: storagePath,
        mime_type: file.type,
        size_bytes: file.size
      })
      .select('*')
      .single();

    if (dbErr) {
      console.error('Failed to save client_note_attachment DB record:', dbErr);
    } else if (dbAtt) {
      uploaded.push(dbAtt as NoteAttachment);
    }
  }

  return uploaded;
}
