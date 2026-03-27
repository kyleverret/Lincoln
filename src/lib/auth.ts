import NextAuth from "next-auth";
import type { JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { audit } from "./audit";
import { UserRole } from "@prisma/client";

const MAX_LOGIN_ATTEMPTS = parseInt(
  process.env.MAX_LOGIN_ATTEMPTS ?? "5",
  10
);
const LOCKOUT_DURATION_MINUTES = parseInt(
  process.env.LOCKOUT_DURATION_MINUTES ?? "30",
  10
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapter: PrismaAdapter(db) as any,
  session: {
    strategy: "jwt",
    maxAge: parseInt(process.env.SESSION_MAX_AGE ?? "28800", 10), // 8 hours
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        tenantSlug: { label: "Firm", type: "text" },
        mfaCode: { label: "MFA Code", type: "text" },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const ip =
          request?.headers?.get("x-forwarded-for") ??
          request?.headers?.get("x-real-ip") ??
          "unknown";
        const userAgent = request?.headers?.get("user-agent") ?? undefined;

        const email = (credentials.email as string).toLowerCase().trim();

        const user = await db.user.findUnique({
          where: { email },
          include: {
            tenantUsers: {
              include: { tenant: true },
              where: { isActive: true },
            },
          },
        });

        if (!user || !user.isActive) {
          await audit.loginFailed(
            { ipAddress: ip, userAgent },
            `Unknown email: ${email}`
          );
          return null;
        }

        // Check account lockout
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          await audit.loginFailed(
            { userId: user.id, ipAddress: ip, userAgent },
            "Account locked"
          );
          return null;
        }

        const passwordValid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );

        if (!passwordValid) {
          const newAttempts = user.failedLoginAttempts + 1;
          const shouldLock = newAttempts >= MAX_LOGIN_ATTEMPTS;

          await db.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: newAttempts,
              lockedUntil: shouldLock
                ? new Date(
                    Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000
                  )
                : undefined,
            },
          });

          await audit.loginFailed(
            { userId: user.id, ipAddress: ip, userAgent },
            `Invalid password (attempt ${newAttempts})`
          );
          return null;
        }

        // Validate MFA if enabled
        if (user.mfaEnabled) {
          if (!credentials.mfaCode) {
            // Signal to the client that MFA is required
            throw new Error("MFA_REQUIRED");
          }
          const { authenticator } = await import("otplib");
          const secret = user.mfaSecret!;
          if (!authenticator.verify({ token: credentials.mfaCode as string, secret })) {
            await audit.loginFailed(
              { userId: user.id, ipAddress: ip, userAgent },
              "Invalid MFA code"
            );
            return null;
          }
        }

        // Determine active tenant context
        // Filter to only active tenants — suspended tenants cannot be accessed
        const activeTenants = user.tenantUsers.filter(
          (tu) => tu.tenant.isActive
        );
        if (activeTenants.length === 0) {
          await audit.loginFailed(
            { userId: user.id, ipAddress: ip, userAgent },
            "All associated tenants are suspended"
          );
          return null;
        }

        let activeTenantUser = activeTenants[0];
        if (credentials.tenantSlug) {
          const found = activeTenants.find(
            (tu) => tu.tenant.slug === credentials.tenantSlug
          );
          if (found) activeTenantUser = found;
        }

        // Reset failed attempts and update last login
        await db.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastLoginAt: new Date(),
            lastLoginIp: ip,
          },
        });

        await audit.login({
          userId: user.id,
          tenantId: activeTenantUser?.tenantId,
          ipAddress: ip,
          userAgent,
        });

        return {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: activeTenantUser?.role ?? UserRole.CLIENT,
          tenantId: activeTenantUser?.tenantId ?? null,
          tenantSlug: activeTenantUser?.tenant?.slug ?? null,
          mfaEnabled: user.mfaEnabled,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.firstName = (user as any).firstName;
        token.lastName = (user as any).lastName;
        token.role = (user as any).role;
        token.tenantId = (user as any).tenantId;
        token.tenantSlug = (user as any).tenantSlug;
        token.mfaEnabled = (user as any).mfaEnabled;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.firstName = token.firstName as string;
        session.user.lastName = token.lastName as string;
        session.user.role = token.role as UserRole;
        session.user.tenantId = token.tenantId as string | null;
        session.user.tenantSlug = token.tenantSlug as string | null;
        session.user.mfaEnabled = token.mfaEnabled as boolean;
      }
      return session;
    },
  },
});

// Extend NextAuth types
declare module "next-auth" {
  interface User {
    id: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    tenantId: string | null;
    tenantSlug: string | null;
    mfaEnabled: boolean;
  }

  interface Session {
    user: User & {
      firstName: string;
      lastName: string;
      role: UserRole;
      tenantId: string | null;
      tenantSlug: string | null;
      mfaEnabled: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    tenantId: string | null;
    tenantSlug: string | null;
    mfaEnabled: boolean;
  }
}
