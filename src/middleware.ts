import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const authCookie = request.cookies.get('crm-auth-session')?.value;
  const isAuth = authCookie === 'true';

  const { pathname } = request.nextUrl;

  const isProtectedRoute = pathname.startsWith('/dashboard') || pathname.startsWith('/personal-information') || pathname.startsWith('/clients');
  const isAuthRoute = pathname === '/login' || pathname === '/register';

  if (isProtectedRoute && !isAuth) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (isAuthRoute && isAuth) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/personal-information/:path*',
    '/clients/:path*',
    '/login',
    '/register',
  ],
};
