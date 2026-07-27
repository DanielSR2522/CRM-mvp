/**
 * Intentional Navigation Tracking & Guard Utility for SmarTrack CRM.
 * Manages dashboard navigation intent and last non-dashboard protected route.
 */

const INTENT_KEY = 'smartrack:dashboard-intent';
const LAST_NON_DASHBOARD_KEY = 'smartrack:last-non-dashboard-route';
const INTENT_TTL_MS = 10000; // 10 seconds

export type DashboardIntentReason =
  | 'sidebar-dashboard-click'
  | 'explicit-login-default'
  | 'exact-root-default'
  | 'direct-address-bar-entry';

interface StoredIntent {
  reason: DashboardIntentReason;
  timestamp: number;
}

/**
 * Checks if a given pathname is a valid non-dashboard protected route that should be saved.
 */
export function isValidNonDashboardRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const path = pathname.trim();

  // Exclude dashboard, public, auth, and non-app routes
  if (
    path === '/' ||
    path === '/dashboard' ||
    path === '/login' ||
    path === '/register' ||
    path.startsWith('/sign') ||
    path.startsWith('/api') ||
    path.startsWith('/_next')
  ) {
    return false;
  }

  return true;
}

/**
 * Sets an explicit dashboard intent before legitimate navigations to /dashboard.
 */
export function setDashboardIntent(reason: DashboardIntentReason): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: StoredIntent = {
      reason,
      timestamp: Date.now(),
    };
    sessionStorage.setItem(INTENT_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('Failed to set dashboard intent:', e);
  }
}

/**
 * Consumes and validates any existing dashboard intent. Returns true if a valid intent existed.
 */
export function consumeValidDashboardIntent(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = sessionStorage.getItem(INTENT_KEY);
    if (!raw) return false;

    sessionStorage.removeItem(INTENT_KEY); // Consume once

    const payload: StoredIntent = JSON.parse(raw);
    if (Date.now() - payload.timestamp < INTENT_TTL_MS) {
      return true;
    }
  } catch (e) {
    console.warn('Failed to consume dashboard intent:', e);
  }
  return false;
}

/**
 * Saves the last non-dashboard protected route in sessionStorage.
 */
export function saveLastNonDashboardRoute(fullPath: string): void {
  if (!userIdOrSessionCheck() || typeof window === 'undefined') return;

  try {
    const urlObj = new URL(fullPath, 'http://localhost');
    if (!isValidNonDashboardRoute(urlObj.pathname)) return;

    sessionStorage.setItem(LAST_NON_DASHBOARD_KEY, fullPath);
  } catch (e) {
    console.warn('Failed to save last non-dashboard route:', e);
  }
}

function userIdOrSessionCheck(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Retrieves the stored last non-dashboard route.
 */
export function getLastNonDashboardRoute(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = sessionStorage.getItem(LAST_NON_DASHBOARD_KEY);
    if (!saved) return null;

    const urlObj = new URL(saved, 'http://localhost');
    if (isValidNonDashboardRoute(urlObj.pathname)) {
      return saved;
    }
  } catch (e) {
    console.warn('Failed to read last non-dashboard route:', e);
  }
  return null;
}

/**
 * Clears all navigation intent state (e.g. on explicit logout).
 */
export function clearNavigationIntent(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(INTENT_KEY);
    sessionStorage.removeItem(LAST_NON_DASHBOARD_KEY);
  } catch (e) {
    console.warn('Failed to clear navigation intent:', e);
  }
}
