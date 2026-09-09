import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

function isDocumentNavigation(request: NextRequest): boolean {
  const secFetchDest = request.headers.get('sec-fetch-dest');
  const accept = request.headers.get('accept') || '';
  const isRsc = request.headers.get('rsc') === '1';
  const isPrefetch =
    request.headers.get('next-router-prefetch') === '1' ||
    request.headers.get('purpose') === 'prefetch';

  if (isRsc || isPrefetch) return false;
  if (secFetchDest === 'document') return true;
  if (accept.includes('text/html') && secFetchDest !== 'empty') return true;

  return false;
}

function createCookieRedirect(url: URL, supabaseResponse: NextResponse): NextResponse {
  const redirectResponse = NextResponse.redirect(url);
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
  });
  return redirectResponse;
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Validate authentication securely with Supabase Auth server via getUser()
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isDocNav = isDocumentNavigation(request);

  const isProtectedRoute =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/personal-information') ||
    pathname.startsWith('/clients') ||
    pathname.startsWith('/leads') ||
    pathname.startsWith('/consents') ||
    pathname.startsWith('/calendar') ||
    pathname.startsWith('/carrier-portals') ||
    pathname.startsWith('/agent-information');

  // ONLY ALLOWED PROXY REDIRECT:
  // Redirect unauthenticated real document navigations to protected routes -> /login
  if (isProtectedRoute && !user && isDocNav) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return createCookieRedirect(url, supabaseResponse);
  }

  // Proxy MUST NEVER redirect an authenticated user to /dashboard.
  return supabaseResponse;
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/personal-information/:path*',
    '/clients/:path*',
    '/leads/:path*',
    '/consents/:path*',
    '/calendar/:path*',
    '/carrier-portals/:path*',
    '/agent-information/:path*',
    '/login',
    '/register',
  ],
};
