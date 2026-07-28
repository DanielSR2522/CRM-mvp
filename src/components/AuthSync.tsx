'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

export default function AuthSync() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Check and sync session cookie on mount
    const syncSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const hasSession = !!session;
        const currentCookie = document.cookie
          .split('; ')
          .find((row) => row.startsWith('crm-auth-session='))
          ?.split('=')[1];

        const expectedCookieValue = hasSession ? 'true' : 'false';

        if (currentCookie !== expectedCookieValue) {
          document.cookie = `crm-auth-session=${expectedCookieValue}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
          router.refresh();
        }
      } catch (err) {
        console.warn('[AuthSync] Failed to sync session cookie:', err);
      }
    };

    syncSession();

    // Subscribe to auth state changes to update the cookie without interrupting active user navigation
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const hasSession = !!session;
      const expectedCookieValue = hasSession ? 'true' : 'false';

      // Always maintain cookie state
      document.cookie = `crm-auth-session=${expectedCookieValue}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;

      // Distinguish auth events cleanly:
      // - TOKEN_REFRESHED, INITIAL_SESSION, USER_UPDATED must NEVER redirect to /dashboard or reset route.
      // - SIGNED_IN for an already authenticated user on an app route must NEVER redirect to /dashboard.
      // - Only SIGNED_OUT for an unauthenticated user on a protected route redirects to /login.

      if (event === 'SIGNED_OUT' && !hasSession) {
        const isPublicRoute = ['/login', '/register', '/'].includes(pathname) || pathname.startsWith('/sign');
        if (!isPublicRoute) {
          const currentSearch = searchParams?.toString();
          const fullPath = pathname + (currentSearch ? `?${currentSearch}` : '');
          router.replace(`/login?next=${encodeURIComponent(fullPath)}`);
        }
      } else if (event === 'SIGNED_IN' && hasSession) {
        // If user is currently on login or register page, send them to dashboard/saved route
        if (pathname === '/login' || pathname === '/register') {
          router.push('/dashboard');
        }
        // If user is already on a valid app route (e.g. /clients/123?section=notes), DO NOT NAVIGATE.
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router, pathname, searchParams]);

  return null;
}
