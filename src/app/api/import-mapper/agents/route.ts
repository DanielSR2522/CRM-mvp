import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createCookieSupabase, listAccessibleAgents, requireImportUser } from '@/lib/import-mapper/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createCookieSupabase(await cookies());
    const user = await requireImportUser(supabase);
    const agents = await listAccessibleAgents(supabase, user.id);
    return NextResponse.json({ agents });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load agents.';
    return NextResponse.json({ error: message }, { status: message.includes('Unauthorized') ? 401 : 500 });
  }
}
