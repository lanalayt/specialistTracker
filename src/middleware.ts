import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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
  "/recover",
];

const AUTH_ROUTES = ["/login", "/signup", "/onboard"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Redirect root to dashboard
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // On localhost (HTTP), Supabase Secure cookies are rejected by the browser,
  // so skip the cookie gate and let the client-side auth context handle it.
  const host = request.headers.get("host") ?? "";
  const isLocalhost = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  if (isLocalhost) {
    return NextResponse.next();
  }

  // Check for Supabase auth cookie (sb-*-auth-token)
  const hasAuthCookie = request.cookies.getAll().some(
    (c) => c.name.startsWith("sb-") && c.name.includes("-auth-token")
  );

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const isAuthRoute = AUTH_ROUTES.some((p) => pathname.startsWith(p));

  // Not logged in → redirect to login
  if (!hasAuthCookie && isProtected) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Logged in → redirect away from auth pages
  if (hasAuthCookie && isAuthRoute) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.png|.*\\.webp).*)",
  ],
};
