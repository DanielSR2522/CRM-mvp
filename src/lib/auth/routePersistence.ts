/**
 * Authenticated route persistence utility for SmarTrack CRM.
 * Stores and restores the last visited authenticated route per user in localStorage.
 */

const STORAGE_PREFIX = 'smartrack:last-route:';

export function getStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

/**
 * Checks if a given pathname is a valid authenticated app route that should be persisted.
 */
export function isPersistableRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const path = pathname.trim();

  // Exclude public, auth, and non-app routes
  if (
    path === '/' ||
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
 * Saves the active route for a given authenticated user.
 */
export function saveLastRoute(userId: string, fullPath: string): void {
  if (!userId || typeof window === 'undefined') return;

  try {
    const urlObj = new URL(fullPath, 'http://localhost');
    const path = urlObj.pathname;
    if (!isPersistableRoute(path)) return;

    // Do not overwrite a specific saved route (/clients, /calendar, etc.) with /dashboard
    if (path === '/dashboard') {
      const existing = localStorage.getItem(getStorageKey(userId));
      if (existing && existing !== '/dashboard') {
        const existingUrl = new URL(existing, 'http://localhost');
        if (existingUrl.pathname !== '/dashboard' && isPersistableRoute(existingUrl.pathname)) {
          return;
        }
      }
    }

    localStorage.setItem(getStorageKey(userId), fullPath);
  } catch (e) {
    console.warn('Failed to save last route to localStorage:', e);
  }
}

/**
 * Retrieves the saved route for a given user if available and valid.
 */
export function getSavedRoute(userId: string): string | null {
  if (!userId || typeof window === 'undefined') return null;

  try {
    const saved = localStorage.getItem(getStorageKey(userId));
    if (!saved) return null;

    const urlObj = new URL(saved, 'http://localhost');
    if (isPersistableRoute(urlObj.pathname)) {
      return saved;
    }
  } catch (e) {
    console.warn('Failed to read last route from localStorage:', e);
  }
  return null;
}

/**
 * Clears the saved route for a user (called upon explicit logout).
 */
export function clearSavedRoute(userId: string): void {
  if (!userId || typeof window === 'undefined') return;

  try {
    localStorage.removeItem(getStorageKey(userId));
  } catch (e) {
    console.warn('Failed to clear last route from localStorage:', e);
  }
}

/**
 * Resolves the target route for a session: returns the saved route if available, otherwise defaultRoute.
 */
export function resolveTargetRoute(userId: string, defaultRoute = '/dashboard'): string {
  const saved = getSavedRoute(userId);
  return saved || defaultRoute;
}
