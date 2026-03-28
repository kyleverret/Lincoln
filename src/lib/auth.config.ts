/**
 * NextAuth configuration that does NOT import Prisma/db.
 * This file is safe to import from Edge Runtime (middleware).
 * The full auth.ts re-exports everything with the PrismaAdapter added.
 */
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";

// Note: The actual authorize() logic lives in auth.ts where db is available.
// This config only defines the provider shape so NextAuth can validate JWTs
// in middleware without importing PrismaClient.
export const authConfig: NextAuthConfig = {
  trustHost: true,
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
      // authorize is handled in the full auth.ts — this stub is needed
      // so the provider is registered for JWT validation in middleware
      authorize: () => null,
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        /* eslint-disable @typescript-eslint/no-explicit-any */
        token.firstName = (user as any).firstName;
        token.lastName = (user as any).lastName;
        token.role = (user as any).role;
        token.tenantId = (user as any).tenantId;
        token.tenantSlug = (user as any).tenantSlug;
        token.mfaEnabled = (user as any).mfaEnabled;
        /* eslint-enable @typescript-eslint/no-explicit-any */
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.firstName = token.firstName as string;
        session.user.lastName = token.lastName as string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).role = token.role;
        session.user.tenantId = token.tenantId as string | null;
        session.user.tenantSlug = token.tenantSlug as string | null;
        session.user.mfaEnabled = token.mfaEnabled as boolean;
      }
      return session;
    },
  },
};
