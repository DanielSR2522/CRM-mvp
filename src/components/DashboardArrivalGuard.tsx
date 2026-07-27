'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  consumeValidDashboardIntent,
  getLastNonDashboardRoute,
  setDashboardIntent,
} from '@/lib/auth/navigationIntent';

export default function DashboardArrivalGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const isRestoringRef = useRef(false);

  useEffect(() => {
    if (pathname !== '/dashboard') {
      isRestoringRef.current = false;
      return;
    }

    if (isRestoringRef.current) return;

    // 1. Consume valid intentional dashboard navigation
    const hasIntent = consumeValidDashboardIntent();
    if (hasIntent) {
      return;
    }

    // 2. Detect real direct browser address bar entry / page reload at /dashboard
    if (typeof window !== 'undefined') {
      const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      if (navEntries.length > 0 && (navEntries[0].type === 'navigate' || navEntries[0].type === 'reload')) {
        // Direct initial document load at /dashboard is intentional user action
        setDashboardIntent('direct-address-bar-entry');
        return;
      }
    }

    // 3. No intent & not direct address bar navigation -> Unsolicited background redirect to /dashboard detected!
    const lastRoute = getLastNonDashboardRoute();
    if (lastRoute) {
      isRestoringRef.current = true;
      console.log('[DashboardArrivalGuard] Unsolicited dashboard navigation intercepted! Restoring last route:', lastRoute);
      router.replace(lastRoute);
    }
  }, [pathname, router]);

  return null;
}
