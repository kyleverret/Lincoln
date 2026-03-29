/**
 * GET /api/admin/compliance — Compliance Dashboard
 *
 * SOC-2 CC4.1 / ISO 27001 A.18.2
 *
 * Returns automated compliance control status for the tenant.
 * Access: FIRM_ADMIN, SUPER_ADMIN
 */

import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { AuditAction } from "@prisma/client";
import { generateComplianceReport } from "@/lib/security/compliance";

export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.user.role, "AUDIT_READ")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const report = await generateComplianceReport(session.user.tenantId);

    await writeAuditLog({
      userId: session.user.id,
      tenantId: session.user.tenantId,
      action: AuditAction.NOTIFICATION_ACCESSED,
      entityType: "ComplianceReport",
      description: "Generated compliance report",
    });

    return Response.json(report);
  } catch (error) {
    console.error("[COMPLIANCE GET]", error);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
