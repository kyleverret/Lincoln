import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { z } from "zod";
import { UserRole } from "@prisma/client";

const createTimeEntrySchema = z.object({
  matterId: z.string().min(1),
  date: z.string().min(1),
  hours: z.number().positive().max(24),
  rate: z.number().min(0),
  description: z.string().min(1).max(500),
  isBillable: z.boolean().default(true),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!hasPermission(session.user.role, "TIMEENTRY_READ")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const matterId = searchParams.get("matterId");
  const unbilledOnly = searchParams.get("unbilled") === "true";

  const canReadAll =
    session.user.role === UserRole.SUPER_ADMIN ||
    session.user.role === UserRole.FIRM_ADMIN;

  try {
    const entries = await db.timeEntry.findMany({
      where: {
        tenantId: session.user.tenantId,
        ...(canReadAll ? {} : { userId: session.user.id }),
        ...(matterId ? { matterId } : {}),
        ...(unbilledOnly ? { isBilled: false, isBillable: true } : {}),
      },
      include: {
        matter: { select: { id: true, title: true, matterNumber: true } },
      },
      orderBy: { date: "desc" },
      take: 200,
    });

    return Response.json(entries);
  } catch (error) {
    console.error("Failed to fetch time entries:", error);
    return Response.json({ error: "Failed to fetch time entries" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!hasPermission(session.user.role, "TIMEENTRY_CREATE")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createTimeEntrySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const { matterId, date, hours, rate, description, isBillable } = parsed.data;

  try {
    // Validate matter belongs to tenant
    const matter = await db.matter.findFirst({
      where: { id: matterId, tenantId: session.user.tenantId },
    });
    if (!matter) return Response.json({ error: "Matter not found" }, { status: 404 });

    const entry = await db.timeEntry.create({
      data: {
        tenantId: session.user.tenantId,
        matterId,
        userId: session.user.id,
        date: new Date(date),
        hours,
        rate,
        description,
        isBillable,
      },
      include: {
        matter: { select: { id: true, title: true, matterNumber: true } },
      },
    });

    await writeAuditLog({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      matterId,
      action: "TIME_ENTRY_CREATED",
      entityType: "TimeEntry",
      entityId: entry.id,
      description: `${hours}h logged on ${matter.matterNumber}`,
    });

    return Response.json(entry, { status: 201 });
  } catch (error) {
    console.error("Failed to create time entry:", error);
    return Response.json({ error: "Failed to create time entry" }, { status: 500 });
  }
}
