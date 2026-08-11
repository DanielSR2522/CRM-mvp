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

    const body = await request.json();
    const { source, docId } = body;

    if (!source || !docId) {
      return NextResponse.json({ error: 'Missing source or docId parameters.' }, { status: 400 });
    }

    let bucket = '';
    let storagePath = '';
    let fileName = '';
    let mimeType: string | null = null;

    // Verify server-side authorization and retrieve storage path
    if (source === 'general') {
      const { data: doc, error } = await supabase
        .from('client_documents')
        .select('id, storage_path, original_filename, display_name, mime_type, clients!inner(agent_id)')
        .eq('id', docId)
        .single();

      if (error || !doc || (doc.clients as any)?.agent_id !== user.id) {
        return NextResponse.json({ error: 'Unauthorized document access.' }, { status: 403 });
      }
      bucket = 'policy-documents';
      storagePath = doc.storage_path;
      fileName = doc.display_name || doc.original_filename;
      mimeType = doc.mime_type;
    } else if (source === 'property_casualty') {
      const { data: doc, error } = await supabase
        .from('policy_documents')
        .select('id, storage_path, original_filename, display_name, mime_type, policy_id')
        .eq('id', docId)
        .single();

      if (error || !doc) {
        return NextResponse.json({ error: 'Unauthorized document access.' }, { status: 403 });
      }

      const { data: pol, error: polErr } = await supabase
        .from('policies')
        .select('id, agent_id')
        .eq('id', doc.policy_id)
        .single();

      if (polErr || !pol) {
        return NextResponse.json({ error: 'Unauthorized document access.' }, { status: 403 });
      }

      bucket = 'policy-documents';
      storagePath = doc.storage_path;
      fileName = doc.display_name || doc.original_filename;
      mimeType = doc.mime_type;
    } else if (source === 'life') {
      const { data: doc, error } = await supabase
        .from('life_policy_documents')
        .select('id, storage_path, file_name, file_type, life_policies!inner(client_id, clients!inner(agent_id))')
        .eq('id', docId)
        .single();

      const ownerAgentId = (doc?.life_policies as any)?.clients?.agent_id;
      if (error || !doc || ownerAgentId !== user.id) {
        return NextResponse.json({ error: 'Unauthorized document access.' }, { status: 403 });
      }

      bucket = 'life-documents';
      storagePath = doc.storage_path;
      fileName = doc.file_name;
      mimeType = doc.file_type;
    } else if (source === 'health') {
      const { data: doc, error } = await supabase
        .from('health_policy_documents')
        .select('id, storage_path, display_name, original_filename, mime_type, health_policies!inner(client_id, clients!inner(agent_id))')
        .eq('id', docId)
        .single();

      const ownerAgentId = (doc?.health_policies as any)?.clients?.agent_id;
      if (error || !doc || ownerAgentId !== user.id) {
        return NextResponse.json({ error: 'Unauthorized document access.' }, { status: 403 });
      }

      bucket = 'health-policy-documents';
      storagePath = doc.storage_path;
      fileName = doc.display_name || doc.original_filename;
      mimeType = doc.mime_type;
    } else if (source === 'lead') {
      const { data: doc, error } = await supabase
        .from('lead_documents')
        .select('id, storage_path, display_name, original_filename, mime_type, leads!inner(assigned_to, created_by)')
        .eq('id', docId)
        .single();

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
