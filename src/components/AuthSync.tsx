'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter, usePathname } from 'next/navigation';

export default function AuthSync() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Check and sync session cookie on mount
    const syncSession = async () => {
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
    };

    syncSession();

    // Subscribe to auth state changes to update the cookie and handle navigation
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const hasSession = !!session;
      const expectedCookieValue = hasSession ? 'true' : 'false';

      // Set cookie
      document.cookie = `crm-auth-session=${expectedCookieValue}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;

      if (event === 'SIGNED_IN') {
        router.push('/dashboard');
        router.refresh();
      } else if (event === 'SIGNED_OUT') {
        router.push('/login');
        router.refresh();
      } else {
        router.refresh();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router, pathname]);

  return null;
}
