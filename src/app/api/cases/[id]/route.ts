import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { hasPermission } from "@/lib/permissions";
import { updateMatterSchema } from "@/lib/validations/matter";
import { UserRole } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { tenantId, role, id: userId } = session.user;
    const { id } = await params;

    const matter = await db.matter.findFirst({
      where: {
        id,
        tenantId,
        isActive: true,
        ...(role !== UserRole.SUPER_ADMIN && role !== UserRole.FIRM_ADMIN
          ? { assignments: { some: { userId } } }
          : {}),
      },
      include: {
        clients: { include: { client: true } },
        assignments: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
        practiceArea: true,
        documents: { where: { isActive: true }, orderBy: { createdAt: "desc" } },
        notes: { orderBy: { createdAt: "desc" } },
        _count: { select: { documents: true, messages: true } },
      },
    });

    if (!matter) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await audit.matterAccessed(
      { tenantId, userId, matterId: matter.id, ipAddress: req.headers.get("x-forwarded-for") ?? undefined },
      matter.id,
      matter.title
    );

    return NextResponse.json(matter);
  } catch (err) {
    console.error("[CASE GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { tenantId, role, id: userId } = session.user;
    const { id } = await params;

    const matter = await db.matter.findFirst({
      where: { id, tenantId, isActive: true },
      include: { assignments: { select: { userId: true } } },
    });

    if (!matter) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const canUpdate =
      role === UserRole.SUPER_ADMIN ||
      role === UserRole.FIRM_ADMIN ||
      (role === UserRole.ATTORNEY && matter.assignments.some((a) => a.userId === userId)) ||
      (role === UserRole.STAFF && matter.assignments.some((a) => a.userId === userId));

    if (!canUpdate) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = updateMatterSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updated = await db.matter.update({
      where: { id },
      data: {
        ...parsed.data,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
        statuteOfLimits: parsed.data.statuteOfLimits ? new Date(parsed.data.statuteOfLimits) : undefined,
      },
    });

    // Keep kanban card in sync
    await db.kanbanCard.updateMany({
      where: { matterId: id },
      data: {
        title: updated.title,
        priority: updated.priority,
        dueDate: updated.dueDate,
      },
    });

    await audit.matterUpdated(
      { tenantId, userId, matterId: id, ipAddress: req.headers.get("x-forwarded-for") ?? undefined },
      id,
      Object.keys(parsed.data).join(", ")
    );

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[CASE PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { tenantId, role } = session.user;
    const { id } = await params;

    if (!hasPermission(role, "MATTER_CLOSE")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Soft delete
    await db.matter.updateMany({
      where: { id, tenantId },
      data: { isActive: false, closedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[CASE DELETE]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

