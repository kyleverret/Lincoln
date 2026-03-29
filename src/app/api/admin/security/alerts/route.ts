/**
 * GET  /api/admin/security/alerts — List security alerts
 * POST /api/admin/security/alerts — Resolve a security alert
 *
 * SOC-2 CC7.2, CC7.3 / ISO 27001 A.12.4.1, A.16.1.2
 *
 * Access: FIRM_ADMIN, SUPER_ADMIN
 */

import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { AuditAction } from "@prisma/client";
import {
  getOpenAlerts,
  getAlertSummary,
  resolveAlert,
} from "@/lib/security/security-monitor";
import type { AlertSeverity } from "@/lib/security/security-monitor";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.user.role, "AUDIT_READ")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const url = new URL(req.url);
    const severity = url.searchParams.get("severity") as AlertSeverity | null;
    const summaryOnly = url.searchParams.get("summary") === "true";

    if (summaryOnly) {
      const summary = await getAlertSummary(session.user.tenantId);
      return Response.json({ summary });
    }

    const alerts = await getOpenAlerts(session.user.tenantId, {
      severity: severity ?? undefined,
      limit: 50,
    });

    return Response.json({ alerts });
  } catch (error) {
    console.error("[SECURITY_ALERTS GET]", error);
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

  if (!hasPermission(session.user.role, "AUDIT_READ")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { alertId, resolution } = body;

    if (!alertId || !resolution) {
      return Response.json(
        { error: "Validation failed", details: "alertId and resolution are required" },
        { status: 400 }
      );
    }

    await resolveAlert(alertId, session.user.id, resolution);

    await writeAuditLog({
      userId: session.user.id,
      tenantId: session.user.tenantId,
      action: AuditAction.NOTIFICATION_UPDATED,
      entityType: "SecurityAlert",
      entityId: alertId,
      description: `Resolved security alert: ${resolution}`,
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("[SECURITY_ALERTS POST]", error);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
