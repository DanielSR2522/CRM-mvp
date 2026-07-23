'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { revalidatePath } from 'next/cache';

export async function deleteClientSecure(clientId: string, accessToken: string) {
  try {
    const adminSupabase = getSupabaseAdmin();
    
    // 1. Verify the authenticated user securely from the JWT token
    const { data: userData, error: userError } = await adminSupabase.auth.getUser(accessToken);
    if (userError || !userData?.user) {
      return { success: false, error: 'Unauthorized: Invalid or expired session.' };
    }
    const agentId = userData.user.id;

    // 2. Verify ownership (sanity check, RLS is bypassed by Admin, so we MUST check agent_id)
    const { data: clientData, error: clientError } = await adminSupabase
      .from('clients')
      .select('agent_id')
      .eq('id', clientId)
      .single();

    if (clientError || !clientData) {
      return { success: false, error: 'Client not found or could not be verified.' };
    }

    if (clientData.agent_id !== agentId) {
      return { success: false, error: 'Unauthorized: You do not have permission to delete this client.' };
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
          if (storageErr) return { success: false, error: 'Failed to clean up policy documents. Deletion aborted.' };
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
            if (storageErr) return { success: false, error: 'Failed to clean up policy notes. Deletion aborted.' };
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
          if (storageErr) return { success: false, error: 'Failed to clean up health documents. Deletion aborted.' };
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
            if (storageErr) return { success: false, error: 'Failed to clean up health notes. Deletion aborted.' };
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
        // Group by bucket
        const byBucket = sigFiles.reduce((acc: any, file: any) => {
          if (!acc[file.storage_bucket]) acc[file.storage_bucket] = [];
          if (file.storage_path) acc[file.storage_bucket].push(file.storage_path);
          return acc;
        }, {} as Record<string, string[]>);
        
        for (const bucket of Object.keys(byBucket)) {
          if (byBucket[bucket].length > 0) {
            const { error: storageErr } = await adminSupabase.storage.from(bucket).remove(byBucket[bucket]);
            if (storageErr) return { success: false, error: 'Failed to clean up signature storage. Deletion aborted.' };
          }
        }
      }

      // Manually delete signature requests to bypass RESTRICT
      const { error: sigErr } = await adminSupabase.from('signature_requests').delete().in('id', reqIds);
      if (sigErr) return { success: false, error: 'Failed to remove signature requests. Deletion aborted.' };
    }

    // 6. Delete the Client (DB ON DELETE CASCADE handles the rest: policies, personal info, etc.)
    const { error: deleteError } = await adminSupabase
      .from('clients')
      .delete()
      .eq('id', clientId);

    if (deleteError) {
      console.error('Server Action Delete Error:', deleteError);
      return { success: false, error: 'Database error while deleting client: ' + deleteError.message };
    }

    revalidatePath('/clients');
    return { success: true, message: 'Client and all associated files deleted successfully.' };
  } catch (error: any) {
    console.error('Unexpected error in deleteClientSecure:', error);
    return { success: false, error: error.message || 'An unexpected error occurred during deletion.' };
  }
}
