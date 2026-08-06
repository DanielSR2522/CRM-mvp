'use server';

import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { revalidatePath } from 'next/cache';

export interface ClientDeletionSummary {
  signature_requests_count: number;
  signed_consents_count: number;
  pending_signatures_count: number;
  health_policies_count: number;
  pc_policies_count: number;
  notes_count: number;
  calendar_activities_count: number;
  uploaded_files_count: number;
}

export async function getClientDeletionSummaryAction(clientId: string, accessToken: string) {
  try {
    if (!clientId || !accessToken) {
      return { success: false, error: 'Not authenticated. Please sign in again.' };
    }

    if (!isAdminConfigured()) {
      return { success: false, error: 'Server administration service is not configured.' };
    }

    const adminSupabase = getSupabaseAdmin();
    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(accessToken);

    if (authError || !user) {
      return { success: false, error: 'Not authenticated. Please sign in again.' };
    }

    // Verify ownership
    const { data: clientData, error: clientError } = await adminSupabase
      .from('clients')
      .select('agent_id')
      .eq('id', clientId)
      .single();

    if (clientError || !clientData) {
      return { success: false, error: 'Client not found.' };
    }

    if (clientData.agent_id !== user.id) {
      return { success: false, error: 'Unauthorized: You do not own this client.' };
    }

    // Fetch counts
    const [
      { count: totalSigReqs },
      { count: signedConsents },
      { count: pendingSigs },
      { count: healthCount },
      { count: pcCount },
      { count: notesCount },
      { count: activitiesCount },
    ] = await Promise.all([
      adminSupabase.from('signature_requests').select('*', { count: 'exact', head: true }).eq('client_id', clientId),
      adminSupabase.from('signature_requests').select('*', { count: 'exact', head: true }).eq('client_id', clientId).eq('status', 'signed'),
      adminSupabase.from('signature_requests').select('*', { count: 'exact', head: true }).eq('client_id', clientId).in('status', ['pending', 'sent', 'viewed']),
      adminSupabase.from('health_policies').select('*', { count: 'exact', head: true }).eq('client_id', clientId),
      adminSupabase.from('policies').select('*', { count: 'exact', head: true }).eq('client_id', clientId),
      adminSupabase.from('notes').select('*', { count: 'exact', head: true }).eq('client_id', clientId),
      adminSupabase.from('activity_events').select('*', { count: 'exact', head: true }).eq('client_id', clientId),
    ]);

    // Count uploaded files
    let uploadedFilesCount = 0;

    // P&C documents
    const { data: pcDocs } = await adminSupabase
      .from('policies')
      .select('id')
      .eq('client_id', clientId);
    if (pcDocs && pcDocs.length > 0) {
      const pIds = pcDocs.map((p: any) => p.id);
      const { count: docCount } = await adminSupabase.from('policy_documents').select('*', { count: 'exact', head: true }).in('policy_id', pIds);
      uploadedFilesCount += docCount || 0;
    }

    // Health documents
    const { data: hpDocs } = await adminSupabase
      .from('health_policies')
      .select('id')
      .eq('client_id', clientId);
    if (hpDocs && hpDocs.length > 0) {
      const hpIds = hpDocs.map((hp: any) => hp.id);
      const { count: hpDocCount } = await adminSupabase.from('health_policy_documents').select('*', { count: 'exact', head: true }).in('health_policy_id', hpIds);
      uploadedFilesCount += hpDocCount || 0;
    }

    // Signature files
    const { data: sigReqs } = await adminSupabase
      .from('signature_requests')
      .select('id')
      .eq('client_id', clientId);
    if (sigReqs && sigReqs.length > 0) {
      const reqIds = sigReqs.map((r: any) => r.id);
      const { count: sigFileCount } = await adminSupabase.from('signature_files').select('*', { count: 'exact', head: true }).in('request_id', reqIds);
      uploadedFilesCount += sigFileCount || 0;
    }

    const summary: ClientDeletionSummary = {
      signature_requests_count: totalSigReqs || 0,
      signed_consents_count: signedConsents || 0,
      pending_signatures_count: pendingSigs || 0,
      health_policies_count: healthCount || 0,
      pc_policies_count: pcCount || 0,
      notes_count: notesCount || 0,
      calendar_activities_count: activitiesCount || 0,
      uploaded_files_count: uploadedFilesCount,
    };

    return { success: true, summary };
  } catch (err: any) {
    console.error('Error fetching client deletion summary:', err);
    return { success: false, error: err?.message || 'Failed to fetch client deletion summary.' };
  }
}

export async function deleteClientSecure(clientId: string, accessToken: string) {
  try {
    if (!clientId || !accessToken) {
      return { success: false, error: 'Not authenticated. Please sign in again.' };
    }

    if (!isAdminConfigured()) {
      return { success: false, error: 'Delete failed: Server administration service is not configured.' };
    }

    const adminSupabase = getSupabaseAdmin();

    // 1. Authenticate user from JWT
    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(accessToken);

    if (authError || !user) {
      return { success: false, error: 'Not authenticated. Please sign in again.' };
    }

    // 2. Verify client ownership
    const { data: clientData, error: clientError } = await adminSupabase
      .from('clients')
      .select('agent_id')
      .eq('id', clientId)
      .single();

    if (clientError || !clientData) {
      return { success: false, error: 'Client not found.' };
    }

    if (clientData.agent_id !== user.id) {
      return { success: false, error: 'Unauthorized: You do not own this client.' };
    }

    // 3. Collect storage file paths BEFORE executing database RPC
    const bucketPathsToClean: Record<string, string[]> = {};

    function addPath(bucket: string, storagePath: string | null | undefined) {
      if (!bucket || !storagePath) return;
      if (!bucketPathsToClean[bucket]) bucketPathsToClean[bucket] = [];
      if (!bucketPathsToClean[bucket].includes(storagePath)) {
        bucketPathsToClean[bucket].push(storagePath);
      }
    }

    // A. P&C Policy Documents & Notes
    const { data: pcPolicies } = await adminSupabase.from('policies').select('id').eq('client_id', clientId);
    if (pcPolicies && pcPolicies.length > 0) {
      const pIds = pcPolicies.map((p: any) => p.id);
      const { data: pDocs } = await adminSupabase.from('policy_documents').select('storage_path').in('policy_id', pIds);
      (pDocs || []).forEach((d: any) => addPath('policy-documents', d.storage_path));

      const { data: pNotes } = await adminSupabase.from('policy_notes').select('id').in('policy_id', pIds);
      if (pNotes && pNotes.length > 0) {
        const nIds = pNotes.map((n: any) => n.id);
        const { data: pAtts } = await adminSupabase.from('policy_note_attachments').select('storage_path').in('note_id', nIds);
        (pAtts || []).forEach((a: any) => addPath('policy-notes', a.storage_path));
      }
    }

    // B. Health Policy Documents & Notes
    const { data: healthPolicies } = await adminSupabase.from('health_policies').select('id').eq('client_id', clientId);
    if (healthPolicies && healthPolicies.length > 0) {
      const hpIds = healthPolicies.map((hp: any) => hp.id);
      const { data: hpDocs } = await adminSupabase.from('health_policy_documents').select('storage_path').in('health_policy_id', hpIds);
      (hpDocs || []).forEach((d: any) => {
        addPath('health-documents', d.storage_path);
        addPath('health-policy-documents', d.storage_path);
      });

      const { data: hpNotes } = await adminSupabase.from('health_policy_notes').select('id').in('health_policy_id', hpIds);
      if (hpNotes && hpNotes.length > 0) {
        const hpnIds = hpNotes.map((n: any) => n.id);
        const { data: hpAtts } = await adminSupabase.from('health_policy_note_attachments').select('storage_path').in('note_id', hpnIds);
        (hpAtts || []).forEach((a: any) => addPath('health-notes', a.storage_path));
      }
    }

    // C. Signature Requests & Signature Files
    const { data: sigReqs } = await adminSupabase.from('signature_requests').select('id, final_file_path').eq('client_id', clientId);
    if (sigReqs && sigReqs.length > 0) {
      (sigReqs || []).forEach((r: any) => addPath('signed-documents', r.final_file_path));

      const reqIds = sigReqs.map((r: any) => r.id);
      const { data: sigFiles } = await adminSupabase.from('signature_files').select('storage_bucket, storage_path').in('request_id', reqIds);
      (sigFiles || []).forEach((f: any) => {
        if (f.storage_bucket && f.storage_path) {
          addPath(f.storage_bucket, f.storage_path);
        }
      });
    }

    // 4. Execute atomic database RPC function delete_client_cascade
    const { data: rpcRes, error: rpcError } = await adminSupabase.rpc('delete_client_cascade', {
      p_client_id: clientId,
      p_agent_id: user.id,
    });

    if (rpcError) {
      console.error('delete_client_cascade RPC Error:', rpcError);
      return {
        success: false,
        error: `Database deletion failed [${rpcError.code || 'RPC_ERROR'}]: ${rpcError.message}`,
        details: rpcError,
      };
    }

    // 5. Database deletion succeeded -> Clean up Storage files
    const failedStoragePaths: string[] = [];
    for (const bucket of Object.keys(bucketPathsToClean)) {
      const paths = bucketPathsToClean[bucket];
      if (paths && paths.length > 0) {
        try {
          const { error: storageErr } = await adminSupabase.storage.from(bucket).remove(paths);
          if (storageErr) {
            console.warn(`Storage removal warning for bucket ${bucket}:`, storageErr.message);
            failedStoragePaths.push(...paths.map(p => `${bucket}:${p}`));
          }
        } catch (sErr: any) {
          console.warn(`Storage exception for bucket ${bucket}:`, sErr?.message);
          failedStoragePaths.push(...paths.map(p => `${bucket}:${p}`));
        }
      }
    }

    revalidatePath('/clients');

    const storageCleanupComplete = failedStoragePaths.length === 0;
    return {
      success: true,
      deleted: true,
      storage_cleanup_complete: storageCleanupComplete,
      failed_storage_paths: failedStoragePaths,
      message: storageCleanupComplete
        ? 'Client and all related data deleted successfully.'
        : 'Client deleted from database. Some storage files could not be removed.',
    };
  } catch (error: any) {
    console.error('Unexpected error in deleteClientSecure:', error);
    return {
      success: false,
      error: error.message || 'An unexpected error occurred during client deletion.',
    };
  }
}
