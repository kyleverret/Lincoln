import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { tenantId, role } = session.user;

    if (!hasPermission(role, "KANBAN_MANAGE")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const { name, color, wipLimit } = await req.json();

    // Verify column belongs to tenant
    const column = await db.kanbanColumn.findFirst({
      where: { id },
      include: { board: { select: { tenantId: true } } },
    });

    if (!column || column.board.tenantId !== tenantId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updated = await db.kanbanColumn.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(color !== undefined && { color }),
        ...(wipLimit !== undefined && { wipLimit }),
      },
    });

    await writeAuditLog({
      userId: session.user.id,
      tenantId: tenantId,
      action: "KANBAN_UPDATED",
      entityType: "KanbanColumn",
      entityId: id,
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[KANBAN COLUMN UPDATE]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { tenantId, role } = session.user;

    if (!hasPermission(role, "KANBAN_MANAGE")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    // Verify column belongs to tenant and check for cards
    const column = await db.kanbanColumn.findFirst({
      where: { id },
      include: {
        board: { select: { tenantId: true } },
        _count: { select: { cards: true } },
      },
    });

    if (!column || column.board.tenantId !== tenantId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (column._count.cards > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete column with ${column._count.cards} card(s). Move or remove cards first.`,
        },
        { status: 400 }
      );
    }

    await writeAuditLog({
      userId: session.user.id,
      tenantId: tenantId,
      action: "KANBAN_DELETED",
      entityType: "KanbanColumn",
      entityId: id,
      description: `Kanban column "${column.name}" deleted`,
    });

    await db.kanbanColumn.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[KANBAN COLUMN DELETE]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
