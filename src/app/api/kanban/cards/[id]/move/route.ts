import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { tenantId, role } = session.user;

    if (!hasPermission(role, "KANBAN_USE")) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const { targetColumnId, newPosition } = await req.json();

    // Verify card belongs to tenant's board
    const card = await db.kanbanCard.findFirst({
      where: { id },
      include: {
        column: {
          include: { board: { select: { tenantId: true } } },
        },
      },
    });

    if (!card || card.column.board.tenantId !== tenantId) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    // Verify target column belongs to same board
    const targetColumn = await db.kanbanColumn.findFirst({
      where: {
        id: targetColumnId,
        board: { tenantId },
      },
    });

    if (!targetColumn) {
      return NextResponse.json(
        { message: "Target column not found" },
        { status: 404 }
      );
    }

    await db.kanbanCard.update({
      where: { id },
      data: {
        columnId: targetColumnId,
        position: newPosition,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[KANBAN MOVE]", err);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
