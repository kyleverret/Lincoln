/**
 * Session Management & Revocation
 *
 * SOC-2 CC6.1, CC6.6 / ISO 27001 A.9.2.1, A.9.4.2
 *
 * Controls:
 * - Active session tracking (in-memory for single instance; Redis for multi)
 * - Force session termination on user deactivation / tenant suspension
 * - Concurrent session limit enforcement
 * - Session activity monitoring
 *
 * Architecture note:
 * NextAuth uses stateless JWTs — there is no server-side session store to
 * invalidate. This module maintains a revocation list that auth middleware
 * checks on every request. When a JWT's `jti` or `userId` appears in the
 * revocation list, the request is rejected even though the JWT signature
 * is still valid.
 *
 * For multi-instance deployments, replace the in-memory Map with Redis
 * (see deferral D-009 in ARCHITECTURE.md).
 */

// --- Configuration ---

/** Maximum concurrent sessions per user (0 = unlimited) */
export const MAX_CONCURRENT_SESSIONS = parseInt(
  process.env.MAX_CONCURRENT_SESSIONS ?? "3",
  10
);

/** How long revocation entries persist (must exceed JWT maxAge) */
const REVOCATION_TTL_MS = 9 * 60 * 60 * 1000; // 9 hours (> 8hr session)

// --- Types ---

export interface ActiveSession {
  userId: string;
  tenantId: string;
  ipAddress: string;
  userAgent: string;
  createdAt: number; // epoch ms
  lastActivityAt: number;
}

interface RevocationEntry {
  reason: string;
  revokedAt: number;
  expiresAt: number;
}

// --- In-Memory Stores ---

/** Active sessions keyed by session token hash / JTI */
const activeSessions = new Map<string, ActiveSession>();

/** Revoked user IDs — blocks ALL sessions for the user */
const revokedUsers = new Map<string, RevocationEntry>();

/** Revoked tenant IDs — blocks ALL sessions for the tenant */
const revokedTenants = new Map<string, RevocationEntry>();

// Periodic cleanup of expired revocation entries (every 15 min)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of revokedUsers) {
    if (entry.expiresAt <= now) revokedUsers.delete(key);
  }
  for (const [key, entry] of revokedTenants) {
    if (entry.expiresAt <= now) revokedTenants.delete(key);
  }
  for (const [key, session] of activeSessions) {
    // Remove sessions older than JWT maxAge + buffer
    if (now - session.createdAt > REVOCATION_TTL_MS) {
      activeSessions.delete(key);
    }
  }
}, 15 * 60 * 1000);

// --- Session Tracking ---

/**
 * Register a new session after successful login.
 * If concurrent session limit is exceeded, the oldest session is evicted.
 */
export function registerSession(
  sessionId: string,
  session: ActiveSession
): { evictedSessionId: string | null } {
  activeSessions.set(sessionId, session);

  if (MAX_CONCURRENT_SESSIONS <= 0) return { evictedSessionId: null };

  // Count active sessions for this user
  const userSessions: [string, ActiveSession][] = [];
  for (const [id, s] of activeSessions) {
    if (s.userId === session.userId) userSessions.push([id, s]);
  }

  if (userSessions.length <= MAX_CONCURRENT_SESSIONS) {
    return { evictedSessionId: null };
  }

  // Evict oldest session
  userSessions.sort((a, b) => a[1].createdAt - b[1].createdAt);
  const [evictedId] = userSessions[0];
  activeSessions.delete(evictedId);

  return { evictedSessionId: evictedId };
}

/**
 * Update last activity timestamp for a session.
 */
export function touchSession(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.lastActivityAt = Date.now();
  }
}

/**
 * Remove a session (e.g., on explicit logout).
 */
export function removeSession(sessionId: string): void {
  activeSessions.delete(sessionId);
}

// --- Revocation ---

/**
 * Revoke all sessions for a user (e.g., deactivation, password change, admin action).
 */
export function revokeUserSessions(userId: string, reason: string): number {
  const now = Date.now();
  revokedUsers.set(userId, {
    reason,
    revokedAt: now,
    expiresAt: now + REVOCATION_TTL_MS,
  });

  // Also remove from active sessions
  let count = 0;
  for (const [id, session] of activeSessions) {
    if (session.userId === userId) {
      activeSessions.delete(id);
      count++;
    }
  }
  return count;
}

/**
 * Revoke all sessions for a tenant (e.g., suspension).
 */
export function revokeTenantSessions(
  tenantId: string,
  reason: string
): number {
  const now = Date.now();
  revokedTenants.set(tenantId, {
    reason,
    revokedAt: now,
    expiresAt: now + REVOCATION_TTL_MS,
  });

  let count = 0;
  for (const [id, session] of activeSessions) {
    if (session.tenantId === tenantId) {
      activeSessions.delete(id);
      count++;
    }
  }
  return count;
}

/**
 * Check if a user or tenant has been revoked.
 * Call this in auth middleware on every request.
 */
export function isSessionRevoked(
  userId: string,
  tenantId: string | null
): { revoked: boolean; reason?: string } {
  const userRevocation = revokedUsers.get(userId);
  if (userRevocation && userRevocation.expiresAt > Date.now()) {
    return { revoked: true, reason: userRevocation.reason };
  }

  if (tenantId) {
    const tenantRevocation = revokedTenants.get(tenantId);
    if (tenantRevocation && tenantRevocation.expiresAt > Date.now()) {
      return { revoked: true, reason: tenantRevocation.reason };
    }
  }

  return { revoked: false };
}

// --- Queries ---

/**
 * Get all active sessions for a user (for admin/compliance dashboards).
 */
export function getUserSessions(
  userId: string
): { sessionId: string; session: ActiveSession }[] {
  const results: { sessionId: string; session: ActiveSession }[] = [];
  for (const [id, session] of activeSessions) {
    if (session.userId === userId) {
      results.push({ sessionId: id, session });
    }
  }
  return results;
}

/**
 * Get all active sessions for a tenant (for admin dashboard).
 */
export function getTenantSessions(
  tenantId: string
): { sessionId: string; session: ActiveSession }[] {
  const results: { sessionId: string; session: ActiveSession }[] = [];
  for (const [id, session] of activeSessions) {
    if (session.tenantId === tenantId) {
      results.push({ sessionId: id, session });
    }
  }
  return results;
}

/**
 * Get total active session count (for platform metrics).
 */
export function getActiveSessionCount(): number {
  return activeSessions.size;
}

/**
 * Get revocation status summary (for compliance dashboard).
 */
export function getRevocationSummary(): {
  revokedUserCount: number;
  revokedTenantCount: number;
} {
  return {
    revokedUserCount: revokedUsers.size,
    revokedTenantCount: revokedTenants.size,
  };
}
