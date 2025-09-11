import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  
  console.log('Middleware processing path:', pathname);
  
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
    console.log('Skipping middleware for:', pathname);
    return NextResponse.next();
  }

  // For all other paths, proxy to the backend redirect handler
  try {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    const redirectUrl = `${backendUrl}${pathname}`;
    
    console.log('Checking backend for redirect:', redirectUrl);
    
    // Fetch from backend to check if this is a valid redirect
    const response = await fetch(redirectUrl, {
      method: 'HEAD',
      redirect: 'manual',
    });

    console.log('Backend response status:', response.status);

    // If backend returns a redirect, forward it
    if (response.status === 301 || response.status === 302) {
      const location = response.headers.get('location');
      console.log('Redirecting to:', location);
      if (location) {
        // Use absolute URL for redirect
        return NextResponse.redirect(new URL(location));
      }
    }

    // If backend returns 404, let Next.js handle it
    if (response.status === 404) {
      console.log('Backend returned 404, passing to Next.js');
      return NextResponse.next();
    }
  } catch (error) {
    console.error('Middleware error:', error);
  }

  // Default: let Next.js handle the request
  console.log('No redirect found, passing to Next.js');
  return NextResponse.next();
}

export const config = {
  matcher: '/((?!api|_next/static|_next/image|favicon.ico).*)',
};