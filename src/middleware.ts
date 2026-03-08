import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that require auth
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/kicking",
  "/punting",
  "/kickoff",
  "/longsnap",
  "/analytics",
  "/athletes",
  "/settings",
  "/profile",
];

// Routes only for unauthenticated users
const AUTH_ROUTES = ["/login", "/signup", "/onboard"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // In production (with Amplify), check Cognito session cookie here.
  // For now, check for our demo auth cookie/header.
  // The actual auth check happens client-side via AppProviders.

  // Redirect root to dashboard
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.png|.*\\.webp).*)",
  ],
};
