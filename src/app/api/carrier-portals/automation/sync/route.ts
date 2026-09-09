import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { runAutomatedSync } from '@/lib/carrier-portals/automation/oscar-adapter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
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

    const result = await runAutomatedSync(user.id, supabase);

    if (!result.success && result.sessionStatus === 'reauthentication_required') {
      return NextResponse.json(
        {
          error: 'Oscar session expired. Reauthentication required via Connect Oscar (Local Test).',
          sessionStatus: 'reauthentication_required',
        },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (err: any) {
    console.error('Automation sync error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to complete automated portal sync.' },
      { status: 500 }
    );
  }
}
