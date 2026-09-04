import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createCookieSupabase, requireImportUser } from '@/lib/import-mapper/auth';
import { parseImportFile } from '@/lib/import-mapper/parser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const supabase = createCookieSupabase(await cookies());
    await requireImportUser(supabase);

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Upload a .xlsx, .xls, or .csv file.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseImportFile(buffer, file.name);
    return NextResponse.json(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to preview file.';
    return NextResponse.json({ error: message }, { status: message.includes('Unauthorized') ? 401 : 400 });
  }
}
