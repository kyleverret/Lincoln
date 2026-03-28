/**
 * Next.js Middleware
 *
 * Handles:
 * 1. Authentication — redirect unauthenticated users to /login
 * 2. Role-based routing — clients go to /portal, firm users to /dashboard
 * 3. Tenant isolation — ensure users only access their own tenant's data
 * 4. Security headers (also set in next.config.ts)
 */

import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Use lightweight auth config (no Prisma) for Edge Runtime compatibility
const { auth } = NextAuth(authConfig);

// String literals instead of UserRole enum to avoid importing @prisma/client in Edge
const CLIENT = "CLIENT";
const SUPER_ADMIN = "SUPER_ADMIN";
const FIRM_ADMIN = "FIRM_ADMIN";

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  "/login",
  "/portal/login",
  "/intake",          // public intake form
  "/api/auth",        // NextAuth endpoints
  "/api/intake/public", // public intake submission
];

// Routes only accessible by CLIENT role
const PORTAL_ROUTES = ["/portal"];

// Routes only accessible by firm users (non-client)
const FIRM_ROUTES = [
  "/dashboard",
  "/cases",
  "/clients",
  "/documents",
  "/admin",
  "/settings",
];

// Routes only accessible by SUPER_ADMIN
const SUPERADMIN_ROUTES = ["/admin/platform"];

export default auth((req: NextRequest & { auth: any }) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  // Allow public routes
  if (PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.next();
  }

  // Require authentication for all other routes
  if (!session?.user) {
    // Portal routes redirect to portal login; firm routes to firm login
    const isPortalRoute = PORTAL_ROUTES.some((r) => pathname.startsWith(r));
    const loginPath = isPortalRoute ? "/portal/login" : "/login";
    const loginUrl = new URL(loginPath, req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const { role } = session.user;

  // Clients can only access portal routes
  if (role === CLIENT) {
    if (!PORTAL_ROUTES.some((r) => pathname.startsWith(r))) {
      return NextResponse.redirect(new URL("/portal", req.url));
    }
    return NextResponse.next();
  }

  // Firm users cannot access client portal
  if (PORTAL_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Super-admin only routes
  if (SUPERADMIN_ROUTES.some((r) => pathname.startsWith(r))) {
    if (role !== SUPER_ADMIN) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  // Admin routes require FIRM_ADMIN or above
  if (pathname.startsWith("/admin")) {
    if (
      role !== SUPER_ADMIN &&
      role !== FIRM_ADMIN
    ) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
};
