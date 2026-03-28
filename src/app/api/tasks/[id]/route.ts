import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";

/**
 * PATCH /api/tasks/[id]
 * Update a task's title, dueDate, priority, or move to a different column.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { tenantId, role, id: userId } = session.user;

    if (!hasPermission(role, "KANBAN_USE")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    // Verify the card belongs to a TASK board in this tenant
    const card = await db.kanbanCard.findFirst({
      where: {
        id,
        column: { board: { tenantId, boardType: "TASK" } },
      },
    });

    if (!card) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const body = await req.json();
    const { title, dueDate, priority, columnId } = body;

    const updated = await db.kanbanCard.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(dueDate !== undefined
          ? { dueDate: dueDate ? new Date(dueDate) : null }
          : {}),
        ...(priority !== undefined ? { priority } : {}),
        ...(columnId !== undefined ? { columnId } : {}),
      },
      include: {
        matter: { select: { id: true, title: true, matterNumber: true } },
        column: { select: { name: true, isTerminal: true } },
      },
    });

    await writeAuditLog({
      action: "TASK_UPDATED",
      tenantId,
      userId,
      matterId: card.matterId,
      entityType: "KanbanCard",
      entityId: id,
      description: `Task updated: "${updated.title}"`,
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[TASKS PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/tasks/[id]
 * Delete a task card from the task board.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { tenantId, role, id: userId } = session.user;

    if (!hasPermission(role, "KANBAN_USE")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    // Verify card belongs to a TASK board in this tenant
    const card = await db.kanbanCard.findFirst({
      where: {
        id,
        column: { board: { tenantId, boardType: "TASK" } },
      },
    });

    if (!card) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    await db.kanbanCard.delete({ where: { id } });

    await writeAuditLog({
      action: "TASK_DELETED",
      tenantId,
      userId,
      matterId: card.matterId,
      entityType: "KanbanCard",
      entityId: id,
      description: `Task deleted: "${card.title}"`,
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
    });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[TASKS DELETE]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
