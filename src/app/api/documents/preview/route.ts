import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { renderOfficeDocument } from '@/lib/documents/office-preview';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          },
        },
      }
    );

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized session.' }, { status: 401 });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request payload.' }, { status: 400 });
    }

    const { source, docId } = body || {};

    if (!source || !docId) {
      return NextResponse.json({ error: 'Missing source or docId parameters.' }, { status: 400 });
    }

    let bucket = '';
    let storagePath = '';
    let fileName = '';
    let mimeType: string | null = null;

    if (source === 'general') {
      const { data: doc, error } = await supabase
        .from('client_documents')
        .select('id, storage_path, original_filename, display_name, mime_type, clients!inner(agent_id)')
        .eq('id', docId)
        .maybeSingle();

      if (error || !doc || (doc.clients as any)?.agent_id !== user.id) {
        return NextResponse.json({ error: 'Unauthorized document access.' }, { status: 403 });
      }
      bucket = 'policy-documents';
      storagePath = doc.storage_path;
      fileName = doc.display_name || doc.original_filename;
      mimeType = doc.mime_type;
    } else if (source === 'property_casualty' || source === 'health' || source === 'policy_document' || source === 'policy') {
      // 1. Try unified policy_documents table (used for both P&C and Health policy documents)
      const { data: doc } = await supabase
        .from('policy_documents')
        .select('id, storage_path, original_filename, display_name, mime_type, policy_id')
        .eq('id', docId)
        .maybeSingle();

      if (doc) {
        let isAuthorized = false;

        // Check if policy_id belongs to a Property & Casualty policy
        const { data: pcPol } = await supabase
          .from('policies')
          .select('id, agent_id, client_id, clients!inner(agent_id)')
          .eq('id', doc.policy_id)
          .maybeSingle();

        if (pcPol) {
          const clientAgentId = (pcPol.clients as any)?.agent_id || pcPol.agent_id;
          if (clientAgentId === user.id || pcPol.agent_id === user.id) {
            isAuthorized = true;
          } else {
            // Check P&C shared access authorization
            const { data: canAccess } = await supabase.rpc('can_access_agent', {
              target_agent_id: clientAgentId,
              req_scope: 'property_casualty',
            });
            isAuthorized = Boolean(canAccess);
          }
        } else {
          // Check if policy_id belongs to a Health policy
          const { data: hpPol } = await supabase
            .from('health_policies')
            .select('id, client_id, clients!inner(agent_id)')
            .eq('id', doc.policy_id)
            .maybeSingle();

          if (hpPol) {
            const clientAgentId = (hpPol.clients as any)?.agent_id;
            if (clientAgentId === user.id) {
              isAuthorized = true;
            }
          }
        }

        if (!isAuthorized) {
          return NextResponse.json({ error: 'Unauthorized document access.' }, { status: 403 });
        }

        bucket = 'policy-documents';
        storagePath = doc.storage_path;
        fileName = doc.display_name || doc.original_filename;
        mimeType = doc.mime_type;
      } else if (source === 'health') {
        // 2. Fallback to legacy health_policy_documents table for source === 'health'
        const { data: legacyDoc, error } = await supabase
          .from('health_policy_documents')
          .select('id, storage_path, display_name, original_filename, mime_type, health_policies!inner(client_id, clients!inner(agent_id))')
          .eq('id', docId)
          .maybeSingle();

        const ownerAgentId = (legacyDoc?.health_policies as any)?.clients?.agent_id;
        if (error || !legacyDoc || ownerAgentId !== user.id) {
          return NextResponse.json({ error: 'Unauthorized document access.' }, { status: 403 });
        }

        bucket = 'health-policy-documents';
        storagePath = legacyDoc.storage_path;
        fileName = legacyDoc.display_name || legacyDoc.original_filename;
        mimeType = legacyDoc.mime_type;
      } else {
        return NextResponse.json({ error: 'Document not found or unauthorized.' }, { status: 403 });
      }
    } else if (source === 'life') {
      const { data: doc, error } = await supabase
        .from('life_policy_documents')
        .select('id, storage_path, file_name, file_type, life_policies!inner(client_id, clients!inner(agent_id))')
        .eq('id', docId)
        .maybeSingle();

      const ownerAgentId = (doc?.life_policies as any)?.clients?.agent_id;
      if (error || !doc || ownerAgentId !== user.id) {
        return NextResponse.json({ error: 'Unauthorized document access.' }, { status: 403 });
      }

      bucket = 'life-documents';
      storagePath = doc.storage_path;
      fileName = doc.file_name;
      mimeType = doc.file_type;
    } else if (source === 'lead') {
      const { data: doc, error } = await supabase
        .from('lead_documents')
        .select('id, storage_path, display_name, original_filename, mime_type, leads!inner(assigned_to, created_by)')
        .eq('id', docId)
        .maybeSingle();

      const leadObj = doc?.leads as any;
      if (error || !doc || (leadObj?.assigned_to !== user.id && leadObj?.created_by !== user.id)) {
        return NextResponse.json({ error: 'Unauthorized document access.' }, { status: 403 });
      }

      bucket = 'lead-files';
      storagePath = doc.storage_path;
      fileName = doc.display_name || doc.original_filename;
      mimeType = doc.mime_type;
    } else {
      return NextResponse.json({ error: 'Invalid document source.' }, { status: 400 });
    }

    // Download document buffer directly from storage
    const { data: fileData, error: downloadErr } = await supabase.storage.from(bucket).download(storagePath);
    if (downloadErr || !fileData) {
      return NextResponse.json({ error: 'Failed to retrieve document file.' }, { status: 404 });
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Limit preview size to 15 MB for safe serverless execution
    if (buffer.length > 15 * 1024 * 1024) {
      return NextResponse.json({ error: 'This document is too large to preview online.' }, { status: 413 });
    }

    const previewResult = await renderOfficeDocument(buffer, fileName, mimeType);
    return NextResponse.json(previewResult);
  } catch (err: any) {
    console.error('Office document preview error:', err);
    return NextResponse.json({ error: 'Unable to generate a preview for this document.' }, { status: 500 });
  }
}
