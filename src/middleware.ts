import { clerkMiddleware } from '@clerk/nextjs/server';
import { getToken } from 'next-auth/jwt';
import { NextResponse, type NextFetchEvent, type NextMiddleware, type NextRequest } from 'next/server';
import { clerkEnabled } from './lib/clerk-config';

/**
 * Every page and API route needs a signed-in person: a Clerk account in an
 * organization, or the Paragon admin username login. Pages send the signed-out
 * to sign in; API routes answer 401.
 */
const PUBLIC_PATHS = [
  /^\/login(\/|$)/,
  /^\/api\/auth(\/|$)/,
  /^\/sign-in(\/|$)/,
  /^\/sign-up(\/|$)/,
  /^\/__clerk(\/|$)/,
  // HumbleFax delivery callbacks carry no session; the route checks its own shared secret.
  /^\/api\/campaigns\/fax-webhook$/,
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((pattern) => pattern.test(pathname));
}

async function hasAdminLogin(req: NextRequest): Promise<boolean> {
  return Boolean(await getToken({ req, secret: process.env.NEXTAUTH_SECRET }));
}

function signedOut(req: NextRequest, withClerk: boolean): NextResponse {
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = withClerk ? '/sign-in' : '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

let clerkHandler: NextMiddleware | null = null;

function withClerk(): NextMiddleware {
  clerkHandler ??= clerkMiddleware(async (auth, req) => {
    if (isPublic(req.nextUrl.pathname)) return NextResponse.next();
    // A session still choosing its organization counts as signed out here,
    // so the sign-in page can finish that step.
    const { userId } = await auth();
    if (userId) return NextResponse.next();
    if (await hasAdminLogin(req)) return NextResponse.next();
    return signedOut(req, true);
  });
  return clerkHandler;
}

export default async function middleware(req: NextRequest, event: NextFetchEvent) {
  if (clerkEnabled()) return withClerk()(req, event);
  if (isPublic(req.nextUrl.pathname)) return NextResponse.next();
  if (await hasAdminLogin(req)) return NextResponse.next();
  return signedOut(req, false);
}

export const config = {
  matcher: [
    // Everything except Next.js internals and static images.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
