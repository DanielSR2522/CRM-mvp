import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthenticatedAgent } from '@/lib/marketing/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { extractCommissionsFromFile } from '@/lib/commissions/extraction-service';
import { matchExtractedRowsToCRM } from '@/lib/commissions/matching-service';

export async function POST(req: NextRequest) {
  console.log('[Commission Upload API] Request received');
  try {
    const authAgent = await resolveAuthenticatedAgent(req);
    if (!authAgent) {
      console.warn('[Commission Upload API] Unauthorized agent');
      return NextResponse.json({ error: 'Unauthorized agent session.' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      console.warn('[Commission Upload API] No file provided');
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }

    const filename = file.name || 'commission_evidence';
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const allowedExts = ['jpg', 'jpeg', 'png', 'pdf', 'webp'];

    if (!allowedExts.includes(ext) && !file.type.includes('pdf') && !file.type.startsWith('image/')) {
      console.warn(`[Commission Upload API] Invalid file type: ${file.type} (${filename})`);
      return NextResponse.json(
        { error: 'Invalid file format. Supported formats: JPG, JPEG, PNG, PDF.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    console.log(`[Commission Upload API] File received: ${filename} (${buffer.length} bytes, type: ${file.type})`);

    // 1. Upload to Supabase Storage bucket
    const admin = getSupabaseAdmin();
    const storagePath = `${authAgent.agentId}/commissions/${Date.now()}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    console.log(`[Commission Upload API] Uploading file to storage path: ${storagePath}`);
    const { data: uploadData, error: uploadErr } = await admin.storage
      .from('crm-documents')
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: true,
      });

    let documentUrl = '';
    if (uploadErr) {
      console.error('[Commission Upload API] Storage upload error:', uploadErr.message);
      documentUrl = `/api/documents/preview?path=${encodeURIComponent(storagePath)}`;
    } else {
      const { data: publicUrlData } = admin.storage.from('crm-documents').getPublicUrl(storagePath);
      documentUrl = publicUrlData?.publicUrl || `/api/documents/preview?path=${encodeURIComponent(storagePath)}`;
    }

    // 2. Extract raw text & rows
    console.log('[Commission Upload API] Starting document extraction...');
    const { rawText, rows, ocrWarning } = await extractCommissionsFromFile(buffer, file.type, filename);
    console.log(`[Commission Upload API] Extraction completed. Extracted ${rows.length} rows. Warning: ${ocrWarning || 'None'}`);

    // 3. Match against real CRM policies owned by agent
    console.log('[Commission Upload API] Matching extracted rows against CRM policies...');
    const matchedRows = await matchExtractedRowsToCRM(rows, authAgent.agentId, admin);
    console.log('[Commission Upload API] Matching completed. Returning response.');

    return NextResponse.json({
      success: true,
      document_url: documentUrl,
      raw_text: rawText,
      rows: matchedRows,
      warning: ocrWarning,
    });
  } catch (err: any) {
    console.error('[Commission Upload API] Exception:', err);
    return NextResponse.json(
      { error: err?.message || 'Could not process this evidence. Please try again.' },
      { status: 500 }
    );
  }
}
