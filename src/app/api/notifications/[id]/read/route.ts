import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.user.role, "NOTIFICATION_READ")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const notification = await db.notification.findFirst({
    where: { id, userId: session.user.id, tenantId: session.user.tenantId ?? undefined },
  });
  if (!notification) return Response.json({ error: "Not found" }, { status: 404 });

  const updated = await db.notification.update({
    where: { id },
    data: { readAt: new Date() },
  });

  return Response.json(updated);
}
