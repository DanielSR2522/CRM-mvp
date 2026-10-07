import { NextResponse, type NextRequest } from 'next/server';
import { getAllDevSessions } from '@/lib/renewals/dev-session-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Disabled in production' }, { status: 404 });
  }

  const sessions = getAllDevSessions();
  return NextResponse.json({ sessions });
}
