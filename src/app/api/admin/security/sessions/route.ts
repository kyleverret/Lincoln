/**
 * GET  /api/admin/security/sessions — List active sessions for tenant
 * POST /api/admin/security/sessions — Revoke sessions for a user
 *
 * SOC-2 CC6.1, CC6.6 / ISO 27001 A.9.2.6
 *
 * Access: FIRM_ADMIN, SUPER_ADMIN
 */

import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { AuditAction } from "@prisma/client";
import {
  getTenantSessions,
  revokeUserSessions,
  getActiveSessionCount,
} from "@/lib/security/session-manager";

export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.user.role, "USER_READ")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const sessions = getTenantSessions(session.user.tenantId);

    return Response.json({
      totalPlatformSessions: getActiveSessionCount(),
      tenantSessions: sessions.map((s) => ({
        sessionId: s.sessionId,
        userId: s.session.userId,
        ipAddress: s.session.ipAddress,
        userAgent: s.session.userAgent,
        createdAt: new Date(s.session.createdAt).toISOString(),
        lastActivityAt: new Date(s.session.lastActivityAt).toISOString(),
      })),
    });
  } catch (error) {
    console.error("[SESSIONS GET]", error);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.user.role, "USER_DEACTIVATE")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { userId, reason } = body;

    if (!userId || !reason) {
      return Response.json(
        { error: "Validation failed", details: "userId and reason are required" },
        { status: 400 }
      );
    }

    const revokedCount = revokeUserSessions(
      userId,
      reason
    );

    await writeAuditLog({
      userId: session.user.id,
      tenantId: session.user.tenantId,
      action: AuditAction.USER_DEACTIVATED,
      entityType: "UserSession",
      entityId: userId,
      description: `Revoked ${revokedCount} session(s) for user ${userId}: ${reason}`,
    });

    return Response.json({
      success: true,
      revokedCount,
    });
  } catch (error) {
    console.error("[SESSIONS POST]", error);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
