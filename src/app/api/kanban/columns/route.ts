import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { tenantId, role } = session.user;

    if (!hasPermission(role, "KANBAN_MANAGE")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { name, color, boardId } = await req.json();

    if (!name || !boardId) {
      return NextResponse.json(
        { error: "Name and boardId are required" },
        { status: 400 }
      );
    }

    // Verify the board belongs to this tenant
    const board = await db.kanbanBoard.findFirst({
      where: { id: boardId, tenantId },
    });

    if (!board) {
      return NextResponse.json(
        { error: "Board not found" },
        { status: 404 }
      );
    }

    // Get max position to auto-set position
    const maxPositionColumn = await db.kanbanColumn.findFirst({
      where: { boardId },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const newPosition = (maxPositionColumn?.position ?? -1) + 1;

    const column = await db.kanbanColumn.create({
      data: {
        boardId,
        name,
        color: color || "#6b7280",
        position: newPosition,
      },
    });

    return NextResponse.json(column, { status: 201 });
  } catch (err) {
    console.error("[KANBAN COLUMN CREATE]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
