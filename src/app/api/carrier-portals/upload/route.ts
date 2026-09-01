import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { parseOscarCsv } from '@/lib/carrier-portals/oscar-csv-parser';
import { executeCarrierSync } from '@/lib/carrier-portals/sync-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB limit

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
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized session.' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const mode = (formData.get('mode') as string) || 'import'; // 'preview' or 'import'
    const carrier = (formData.get('carrier') as string) || 'oscar';

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: 'File size exceeds 10 MB limit.' }, { status: 400 });
    }

    const text = await file.text();

    if (!text || !text.trim()) {
      return NextResponse.json({ error: 'Uploaded CSV file is empty.' }, { status: 400 });
    }

    // Parse CSV
    const previewResult = parseOscarCsv(text);

    if (mode === 'preview') {
      return NextResponse.json({
        success: true,
        filename: file.name,
        preview: {
          totalRows: previewResult.totalRows,
          activeCount: previewResult.activeCount,
          inactiveCount: previewResult.inactiveCount,
          gracePeriodCount: previewResult.gracePeriodCount,
          balanceDueCount: previewResult.balanceDueCount,
          sampleRecords: previewResult.records.slice(0, 10),
        },
      });
    }

    // Execute Import
    const syncResult = await executeCarrierSync({
      supabase,
      agentId: user.id,
      carrier: carrier as any,
      source: 'manual_csv',
      records: previewResult.records,
    });

    return NextResponse.json({
      success: true,
      filename: file.name,
      result: syncResult,
    });
  } catch (err: any) {
    console.error('Carrier portal CSV upload error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to process carrier CSV file.' },
      { status: 400 }
    );
  }
}
