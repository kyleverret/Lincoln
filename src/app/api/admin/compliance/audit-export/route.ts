/**
 * GET /api/admin/compliance/audit-export — Audit Log Export
 *
 * SOC-2 CC7.1 / ISO 27001 A.12.4.1 / HIPAA §164.312(b)
 *
 * Exports audit logs as JSON for external auditors.
 * Supports date range filtering and pagination.
 *
 * Query params:
 *   startDate  — ISO 8601 date (inclusive)
 *   endDate    — ISO 8601 date (inclusive)
 *   actions    — comma-separated list of AuditAction values
 *   limit      — max records (default 200, max 200)
 *   offset     — pagination offset
 *
 * Access: FIRM_ADMIN, SUPER_ADMIN
 */

import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { AuditAction } from "@prisma/client";
import { exportAuditLogs } from "@/lib/security/compliance";

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
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const actions = url.searchParams.get("actions");
    const limit = parseInt(url.searchParams.get("limit") ?? "200", 10);
    const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

    const result = await exportAuditLogs(session.user.tenantId, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      actions: actions ? actions.split(",") : undefined,
      limit: Math.min(limit, 200),
      offset,
    });

    await writeAuditLog({
      userId: session.user.id,
      tenantId: session.user.tenantId,
      action: AuditAction.NOTIFICATION_ACCESSED,
      entityType: "AuditExport",
      description: `Exported ${result.entries.length} of ${result.total} audit log entries`,
    });

    return Response.json(result);
  } catch (error) {
    console.error("[AUDIT_EXPORT GET]", error);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
