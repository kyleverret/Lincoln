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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { tenantId, role } = session.user;

    if (!hasPermission(role, "KANBAN_USE")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
      return NextResponse.json({ error: "Not found" }, { status: 404 });
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
        { error: "Target column not found" },
        { status: 404 }
      );
    }

    const sourceColumnId = card.columnId;
    const oldPosition = card.position;

    await db.$transaction(async (tx) => {
      // Shift cards down in target column to make room at newPosition
      await tx.kanbanCard.updateMany({
        where: {
          columnId: targetColumnId,
          position: { gte: newPosition },
          id: { not: id }, // exclude the card being moved
        },
        data: { position: { increment: 1 } },
      });

      // Move the card to its new column and position
      await tx.kanbanCard.update({
        where: { id },
        data: {
          columnId: targetColumnId,
          position: newPosition,
        },
      });

      // Close the gap in the source column (only if moving between columns)
      if (sourceColumnId !== targetColumnId) {
        await tx.kanbanCard.updateMany({
          where: {
            columnId: sourceColumnId,
            position: { gt: oldPosition },
          },
          data: { position: { decrement: 1 } },
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[KANBAN MOVE]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
