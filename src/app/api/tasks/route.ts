import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { UserRole } from "@prisma/client";

const TASK_BOARD_DEFAULTS = [
  { name: "To Do", color: "#6b7280", position: 0 },
  { name: "In Progress", color: "#3b82f6", position: 1 },
  { name: "In Review", color: "#f97316", position: 2 },
  { name: "Done", color: "#22c55e", position: 3, isTerminal: true },
];

async function getOrCreateTaskBoard(tenantId: string) {
  let board = await db.kanbanBoard.findFirst({
    where: { tenantId, boardType: "TASK", isActive: true },
    include: { columns: { orderBy: { position: "asc" } } },
  });

  if (!board) {
    board = await db.kanbanBoard.create({
      data: {
        tenantId,
        name: "Tasks",
        boardType: "TASK",
        isDefault: false,
        columns: { create: TASK_BOARD_DEFAULTS },
      },
      include: { columns: { orderBy: { position: "asc" } } },
    });
  }

  return board;
}

/**
 * GET /api/tasks
 * Returns all task cards for the tenant's task board.
 * Optional query: ?matterId=xxx to filter to one case.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { tenantId, role, id: userId } = session.user;

    if (!hasPermission(role, "KANBAN_USE")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const matterId = req.nextUrl.searchParams.get("matterId") ?? undefined;
    const canReadAll =
      role === UserRole.SUPER_ADMIN || role === UserRole.FIRM_ADMIN;

    const cards = await db.kanbanCard.findMany({
      where: {
        column: { board: { tenantId, boardType: "TASK" } },
        ...(matterId ? { matterId } : {}),
        matter: canReadAll
          ? { tenantId }
          : { tenantId, assignments: { some: { userId } } },
      },
      include: {
        matter: { select: { id: true, title: true, matterNumber: true } },
        column: { select: { name: true, isTerminal: true, position: true } },
      },
      orderBy: [{ column: { position: "asc" } }, { position: "asc" }],
      take: 200,
    });

    return NextResponse.json(cards);
  } catch (err) {
    console.error("[TASKS GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/tasks
 * Always creates a new task card in the task board. Never upserts.
 * Body: { matterId, title, dueDate?, priority?, columnId? }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { tenantId, role, id: userId } = session.user;

    if (!hasPermission(role, "KANBAN_USE")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { matterId, title, dueDate, priority, columnId } = body;

    if (!matterId || !title) {
      return NextResponse.json(
        { error: "matterId and title are required" },
        { status: 400 }
      );
    }

    // Verify matter belongs to tenant
    const matter = await db.matter.findFirst({
      where: { id: matterId, tenantId },
    });
    if (!matter) {
      return NextResponse.json({ error: "Matter not found" }, { status: 404 });
    }

    // Get or bootstrap the task board
    const board = await getOrCreateTaskBoard(tenantId);

    // Use provided column or fall back to first non-terminal column
    let targetColumnId = columnId;
    if (!targetColumnId) {
      const firstCol = board.columns.find((c: { isTerminal: boolean }) => !c.isTerminal);
      if (!firstCol) {
        return NextResponse.json(
          { error: "No task columns configured" },
          { status: 400 }
        );
      }
      targetColumnId = firstCol.id;
    }

    // Verify column belongs to the task board
    const column = board.columns.find((c: { id: string }) => c.id === targetColumnId);
    if (!column) {
      return NextResponse.json(
        { error: "Invalid column" },
        { status: 400 }
      );
    }

    const positionCount = await db.kanbanCard.count({
      where: { columnId: targetColumnId },
    });

    // Always create — never upsert (fixes BUG-024)
    const card = await db.kanbanCard.create({
      data: {
        columnId: targetColumnId,
        matterId,
        title,
        dueDate: dueDate ? new Date(dueDate) : null,
        priority: priority ?? "MEDIUM",
        position: positionCount,
      },
      include: {
        matter: { select: { id: true, title: true, matterNumber: true } },
        column: { select: { name: true, isTerminal: true } },
      },
    });

    await writeAuditLog({
      action: "TASK_CREATED",
      tenantId,
      userId,
      matterId,
      entityType: "KanbanCard",
      entityId: card.id,
      description: `Task created: "${title}"`,
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
    });

    return NextResponse.json(card, { status: 201 });
  } catch (err) {
    console.error("[TASKS POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
