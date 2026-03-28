import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";

export async function PUT(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { tenantId, role, id: userId } = session.user;

    if (!hasPermission(role, "FIRM_DASHBOARD")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!name || name.length < 2 || name.length > 200) {
      return NextResponse.json(
        { error: "Firm name must be between 2 and 200 characters" },
        { status: 400 }
      );
    }

    // Verify tenant exists and belongs to user
    const tenant = await db.tenant.findFirst({
      where: { id: tenantId },
      select: { id: true },
    });

    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    await db.tenant.update({
      where: { id: tenantId },
      data: { name },
    });

    await writeAuditLog({
      userId,
      tenantId,
      action: "TENANT_UPDATED",
      entityType: "Tenant",
      entityId: tenantId,
      description: "Updated firm name",
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[SETTINGS FIRM PUT]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
