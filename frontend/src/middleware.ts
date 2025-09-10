import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Temporarily disable Clerk authentication until properly configured
export function middleware(request: NextRequest) {
  // For now, just pass through all requests
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};