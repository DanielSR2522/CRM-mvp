'use server';

import { cookies } from 'next/headers';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { revalidatePath } from 'next/cache';

export async function deleteClientSecure(clientId: string) {
  try {
    if (!isAdminConfigured()) {
      return { success: false, error: 'Delete failed: Server configuration is missing.' };
    }

    // 1. Obtain authenticated user from actual Supabase server session/cookies
    const cookieStore = await cookies();
    let accessToken: string | null = null;

    const allCookies = cookieStore.getAll();
    for (const c of allCookies) {
      const val = c.value.trim();
      if (!val) continue;

      if (
        c.name.includes('auth-token') ||
        c.name.includes('access_token') ||
        c.name.startsWith('sb-') ||
        c.name.includes('supabase') ||
        c.name.includes('session')
      ) {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed) && typeof parsed[0] === 'string' && parsed[0].split('.').length === 3) {
            accessToken = parsed[0];
            break;
          } else if (parsed && typeof parsed.access_token === 'string') {
            accessToken = parsed.access_token;
            break;
          } else if (parsed && typeof parsed.currentSession?.access_token === 'string') {
            accessToken = parsed.currentSession.access_token;
            break;
          }
        } catch {
          if (val.split('.').length === 3) {
            accessToken = val;
            break;
          }
        }
      }
    }

    const adminSupabase = getSupabaseAdmin();

    let authenticatedUserId: string | null = null;
    if (accessToken) {
      const { data: userData, error: userError } = await adminSupabase.auth.getUser(accessToken);
      if (!userError && userData?.user) {
        authenticatedUserId = userData.user.id;
      }
    }

    if (!authenticatedUserId) {
      return { success: false, error: 'Not authenticated. Please sign in again.' };
    }

    const agentId = authenticatedUserId;

    // 2. Fetch the client by client ID and verify ownership
    const { data: clientData, error: clientError } = await adminSupabase
      .from('clients')
      .select('agent_id')
      .eq('id', clientId)
      .single();

    if (clientError || !clientData) {
      return { success: false, error: 'Client not found.' };
    }

    if (clientData.agent_id !== agentId) {
      return { success: false, error: 'Unauthorized: You do not own this client.' };
    }

    // 3. Identify and cleanup Storage for Policies
    const { data: policies } = await adminSupabase
      .from('policies')
      .select('id')
      .eq('client_id', clientId);

    if (policies && policies.length > 0) {
      const policyIds = policies.map((p: any) => p.id);
      
      // Policy Documents
      const { data: docs } = await adminSupabase
        .from('policy_documents')
        .select('storage_path')
        .in('policy_id', policyIds);
      if (docs && docs.length > 0) {
        const paths = docs.map((d: any) => d.storage_path).filter(Boolean);
        if (paths.length > 0) {
          const { error: storageErr } = await adminSupabase.storage.from('policy-documents').remove(paths);
          if (storageErr) return { success: false, error: 'Delete failed: Failed to clean up policy documents. Deletion aborted.' };
        }
      }

      // Policy Notes
      const { data: notes } = await adminSupabase
        .from('policy_notes')
        .select('id')
        .in('policy_id', policyIds);
      if (notes && notes.length > 0) {
        const noteIds = notes.map((n: any) => n.id);
        const { data: atts } = await adminSupabase
          .from('policy_note_attachments')
          .select('storage_path')
          .in('note_id', noteIds);
        if (atts && atts.length > 0) {
          const attPaths = atts.map((a: any) => a.storage_path).filter(Boolean);
          if (attPaths.length > 0) {
            const { error: storageErr } = await adminSupabase.storage.from('policy-notes').remove(attPaths);
            if (storageErr) return { success: false, error: 'Delete failed: Failed to clean up policy notes. Deletion aborted.' };
          }
        }
      }
    }

    // 4. Identify and cleanup Storage for Health Policies
    const { data: healthPolicies } = await adminSupabase
      .from('health_policies')
      .select('id')
      .eq('client_id', clientId);

    if (healthPolicies && healthPolicies.length > 0) {
      const hpIds = healthPolicies.map((hp: any) => hp.id);
      
      // Health Policy Documents
      const { data: hpDocs } = await adminSupabase
        .from('health_policy_documents')
        .select('storage_path')
        .in('health_policy_id', hpIds);
      if (hpDocs && hpDocs.length > 0) {
        const hpPaths = hpDocs.map((d: any) => d.storage_path).filter(Boolean);
        if (hpPaths.length > 0) {
          const { error: storageErr } = await adminSupabase.storage.from('health-documents').remove(hpPaths);
          if (storageErr) return { success: false, error: 'Delete failed: Failed to clean up health documents. Deletion aborted.' };
        }
      }

      // Health Policy Notes
      const { data: hpNotes } = await adminSupabase
        .from('health_policy_notes')
        .select('id')
        .in('health_policy_id', hpIds);
      if (hpNotes && hpNotes.length > 0) {
        const hpNoteIds = hpNotes.map((n: any) => n.id);
        const { data: hpAtts } = await adminSupabase
          .from('health_policy_note_attachments')
          .select('storage_path')
          .in('note_id', hpNoteIds);
        if (hpAtts && hpAtts.length > 0) {
          const hpAttPaths = hpAtts.map((a: any) => a.storage_path).filter(Boolean);
          if (hpAttPaths.length > 0) {
            const { error: storageErr } = await adminSupabase.storage.from('health-notes').remove(hpAttPaths);
            if (storageErr) return { success: false, error: 'Delete failed: Failed to clean up health notes. Deletion aborted.' };
          }
        }
      }
    }

    // 5. Identify and cleanup Signatures (RESTRICT constraint)
    const { data: sigReqs } = await adminSupabase
      .from('signature_requests')
      .select('id')
      .eq('client_id', clientId);
      
    if (sigReqs && sigReqs.length > 0) {
      const reqIds = sigReqs.map((r: any) => r.id);
      
      // Clean signature files from storage
      const { data: sigFiles } = await adminSupabase
        .from('signature_files')
        .select('storage_bucket, storage_path')
        .in('request_id', reqIds);
        
      if (sigFiles && sigFiles.length > 0) {
        const byBucket = sigFiles.reduce((acc: any, file: any) => {
          if (!acc[file.storage_bucket]) acc[file.storage_bucket] = [];
          if (file.storage_path) acc[file.storage_bucket].push(file.storage_path);
          return acc;
        }, {} as Record<string, string[]>);
        
        for (const bucket of Object.keys(byBucket)) {
          if (byBucket[bucket].length > 0) {
            const { error: storageErr } = await adminSupabase.storage.from(bucket).remove(byBucket[bucket]);
            if (storageErr) return { success: false, error: 'Delete failed: Failed to clean up signature storage. Deletion aborted.' };
          }
        }
      }

      // Manually delete signature requests to bypass RESTRICT
      const { error: sigErr } = await adminSupabase.from('signature_requests').delete().in('id', reqIds);
      if (sigErr) return { success: false, error: 'Delete failed: Failed to remove signature requests. Deletion aborted.' };
    }

    // 6. Delete the Client (DB ON DELETE CASCADE handles the rest)
    const { error: deleteError } = await adminSupabase
      .from('clients')
      .delete()
      .eq('id', clientId);

    if (deleteError) {
      console.error('Server Action Delete Error:', deleteError);
      return { success: false, error: 'Delete failed: ' + deleteError.message };
    }

    revalidatePath('/clients');
    return { success: true, message: 'Client and all associated files deleted successfully.' };
  } catch (error: any) {
    console.error('Unexpected error in deleteClientSecure:', error);
    return { success: false, error: error.message || 'An unexpected error occurred during deletion.' };
  }
}
