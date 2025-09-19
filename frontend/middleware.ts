import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Skip API routes, static files, and Next.js internals
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon.ico') ||
    pathname === '/' ||
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/create') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/settings') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // For all other paths, proxy to the backend redirect handler
  try {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL 
      || `${request.nextUrl.protocol}//${request.nextUrl.hostname}:8080`;
    const redirectUrl = `${backendUrl}${pathname}`;

    const response = await fetch(redirectUrl, {
      method: 'HEAD',
      redirect: 'manual',
    });

    // If backend returns a redirect, forward it
    if (response.status === 301 || response.status === 302) {
      const location = response.headers.get('location');
      if (location) {
        return NextResponse.redirect(new URL(location));
      }
    }

    // If backend returns 404, let Next.js handle it
    if (response.status === 404) {
      return NextResponse.next();
    }
  } catch (error) {
    // Swallow errors and let Next.js handle the route
  }

  // Default: let Next.js handle the request
  return NextResponse.next();
}

export const config = {
  matcher: '/((?!api|_next/static|_next/image|favicon.ico).*)',
};
