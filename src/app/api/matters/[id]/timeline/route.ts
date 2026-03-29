/**
 * GET /api/matters/[id]/timeline — Matter activity timeline
 *
 * Returns audit log entries and notes for a specific matter,
 * combined and sorted chronologically.
 *
 * Access: Users with MATTER_READ_ANY or assigned to the matter.
 */

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasAnyPermission } from "@/lib/permissions";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: matterId } = await params;
  const { tenantId, role, id: userId } = session.user;

  // Verify matter exists and user has access
  const matter = await db.matter.findFirst({
    where: { id: matterId, tenantId, isActive: true },
    select: {
      id: true,
      assignments: { select: { userId: true } },
    },
  });

  if (!matter) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const canReadAny = hasAnyPermission(role, ["MATTER_READ_ANY"]);
  const isAssigned = matter.assignments.some((a) => a.userId === userId);

  if (!canReadAny && !isAssigned) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 100);

    // Fetch audit log entries for this matter
    const auditEntries = await db.auditLog.findMany({
      where: { matterId, tenantId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        action: true,
        description: true,
        entityType: true,
        createdAt: true,
        user: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    const timeline = auditEntries.map((entry) => ({
      id: entry.id,
      type: "audit" as const,
      action: entry.action,
      description: entry.description,
      entityType: entry.entityType,
      timestamp: entry.createdAt.toISOString(),
      user: entry.user
        ? `${entry.user.firstName} ${entry.user.lastName}`
        : "System",
    }));

    return Response.json({ timeline });
  } catch (error) {
    console.error("[TIMELINE GET]", error);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
