'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { resolveTargetRoute } from '@/lib/auth/routePersistence';
import { navigateToDashboard } from '@/lib/auth/dashboardNavigationGuard';
import { setDashboardIntent } from '@/lib/auth/navigationIntent';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const checkSession = async () => {
      // Execute route restoration ONLY if currently on exact root path /
      if (typeof window !== 'undefined' && window.location.pathname !== '/') {
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setDashboardIntent('exact-root-default');
        const target = resolveTargetRoute(session.user.id, '/dashboard');
        navigateToDashboard(router, 'exact-root-entry', target);
      } else {
        router.replace('/login');
      }
    };
    checkSession();
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
      <div className="flex flex-col items-center gap-3">
        <svg className="animate-spin h-8 w-8 text-violet-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <p className="text-sm font-medium text-slate-400">Loading session...</p>
      </div>
    </main>
  );
}
