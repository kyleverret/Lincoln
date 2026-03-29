import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { hasPermission } from "@/lib/permissions";
import { createMatterSchema } from "@/lib/validations/matter";
import { generateMatterNumber } from "@/lib/utils";
import { UserRole } from "@prisma/client";

export async function GET(_req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { tenantId, role, id: userId } = session.user;
    const canSeeAll =
      role === UserRole.SUPER_ADMIN || role === UserRole.FIRM_ADMIN;

    const matters = await db.matter.findMany({
      where: canSeeAll
        ? { tenantId, isActive: true }
        : { tenantId, isActive: true, assignments: { some: { userId } } },
      orderBy: { updatedAt: "desc" },
      include: {
        clients: {
          include: {
            client: { select: { firstName: true, lastName: true } },
          },
        },
        assignments: {
          include: {
            user: { select: { firstName: true, lastName: true } },
          },
        },
        practiceArea: { select: { name: true } },
        _count: { select: { documents: true } },
      },
    });

    return NextResponse.json(matters);
  } catch (err) {
    console.error("[CASES GET]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { tenantId, role, id: userId } = session.user;

    if (!hasPermission(role, "MATTER_CREATE")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = createMatterSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Generate matter number
    const count = await db.matter.count({ where: { tenantId } });
    const matterNumber = generateMatterNumber(count + 1);

    // Validate clients belong to tenant
    const clients = await db.client.findMany({
      where: {
        id: { in: data.clientIds },
        tenantId,
        isActive: true,
      },
      select: { id: true },
    });

    if (clients.length !== data.clientIds.length) {
      return NextResponse.json(
        { error: "One or more clients not found" },
        { status: 400 }
      );
    }

    const matter = await db.matter.create({
      data: {
        tenantId,
        matterNumber,
        title: data.title,
        description: data.description,
        practiceAreaId: data.practiceAreaId,
        status: data.status,
        priority: data.priority,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        statuteOfLimits: data.statuteOfLimits
          ? new Date(data.statuteOfLimits)
          : undefined,
        billingType: data.billingType,
        hourlyRate: data.hourlyRate,
        flatFee: data.flatFee,
        retainerAmount: data.retainerAmount,
        courtName: data.courtName,
        caseNumber: data.caseNumber,
        judge: data.judge,
        opposingCounsel: data.opposingCounsel,
        isConfidential: data.isConfidential ?? false,
        clients: {
          create: data.clientIds.map((clientId, idx) => ({
            clientId,
            isPrimary: idx === 0,
          })),
        },
        assignments: data.assigneeIds?.length
          ? {
              create: data.assigneeIds.map((uid, idx) => ({
                userId: uid,
                isLead: idx === 0,
              })),
            }
          : undefined,
      },
    });

    // Add to default kanban board
    const board = await db.kanbanBoard.findFirst({
      where: { tenantId, isDefault: true },
      include: {
        columns: { orderBy: { position: "asc" }, take: 1 },
      },
    });

    if (board?.columns[0]) {
      const maxPosition = await db.kanbanCard.count({
        where: { columnId: board.columns[0].id },
      });
      await db.kanbanCard.create({
        data: {
          columnId: board.columns[0].id,
          matterId: matter.id,
          title: matter.title,
          priority: matter.priority,
          position: maxPosition,
          dueDate: matter.dueDate,
        },
      });
    }

    await audit.matterCreated(
      {
        tenantId,
        userId,
        matterId: matter.id,
        ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      },
      matter.id,
      matter.title
    );

    return NextResponse.json(matter, { status: 201 });
  } catch (err) {
    console.error("[CASES POST]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
