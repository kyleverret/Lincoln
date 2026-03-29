import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { UserRole } from "@prisma/client";

/**
 * GET /api/action-items
 * Returns matters the user can access, along with their kanban card info,
 * so the UI can offer "add action item" (set due date) for matters without one.
 */
export async function GET(_req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { tenantId, role, id: userId } = session.user;

    if (!hasPermission(role, "KANBAN_USE")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const canReadAll =
      role === UserRole.SUPER_ADMIN || role === UserRole.FIRM_ADMIN;

    const matters = await db.matter.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(canReadAll ? {} : { assignments: { some: { userId } } }),
      },
      select: {
        id: true,
        title: true,
        matterNumber: true,
        kanbanCards: {
          select: {
            id: true,
            title: true,
            dueDate: true,
            priority: true,
            column: { select: { name: true, isTerminal: true } },
          },
        },
      },
      orderBy: { title: "asc" },
      take: 200,
    });

    return NextResponse.json(matters);
  } catch (err) {
    console.error("[ACTION-ITEMS GET]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/action-items
 * Sets or updates the due date and title on a matter's kanban card.
 * Body: { matterId, title, dueDate, priority? }
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
    const { matterId, title, dueDate, priority } = body;

    if (!matterId || !title || !dueDate) {
      return NextResponse.json(
        { error: "matterId, title, and dueDate are required" },
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

    // Find the matter's existing kanban card (non-terminal column)
    const existingCard = await db.kanbanCard.findFirst({
      where: {
        matterId,
        column: {
          isTerminal: false,
          board: { tenantId },
        },
      },
    });

    let card;

    if (existingCard) {
      // Update the existing card's due date and title
      card = await db.kanbanCard.update({
        where: { id: existingCard.id },
        data: {
          title,
          dueDate: new Date(dueDate),
          ...(priority ? { priority } : {}),
        },
      });
    } else {
      // No card exists yet — find the default board's first column and create one
      const board = await db.kanbanBoard.findFirst({
        where: { tenantId, isDefault: true },
        include: {
          columns: { orderBy: { position: "asc" }, take: 1 },
        },
      });

      if (!board?.columns[0]) {
        return NextResponse.json(
          { error: "No kanban board configured" },
          { status: 400 }
        );
      }

      const maxPosition = await db.kanbanCard.count({
        where: { columnId: board.columns[0].id },
      });

      card = await db.kanbanCard.create({
        data: {
          columnId: board.columns[0].id,
          matterId,
          title,
          dueDate: new Date(dueDate),
          priority: priority ?? "MEDIUM",
          position: maxPosition,
        },
      });
    }

    await writeAuditLog({
      action: "KANBAN_UPDATED",
      tenantId,
      userId,
      matterId,
      entityType: "KanbanCard",
      entityId: card.id,
      description: `Action item set: "${title}" due ${dueDate}`,
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
    });

    return NextResponse.json(card, { status: existingCard ? 200 : 201 });
  } catch (err) {
    console.error("[ACTION-ITEMS POST]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
