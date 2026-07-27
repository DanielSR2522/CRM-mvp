/**
 * Hard Development Assertion Guard for Dashboard Navigations
 * Ensures that programmatic navigation to /dashboard occurs ONLY from explicit approved sources.
 */

export function navigateToDashboard(
  router: { replace: (url: string) => void; push: (url: string) => void },
  source: 'explicit-login-submit' | 'exact-root-entry',
  targetUrl?: string
): void {
  if (source !== 'explicit-login-submit' && source !== 'exact-root-entry') {
    console.error('[BlockedDashboardNavigation]', {
      source,
      currentPathname: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
      stack: new Error().stack,
    });
    return;
  }

  const destination = targetUrl || '/dashboard';
  router.replace(destination);
}
