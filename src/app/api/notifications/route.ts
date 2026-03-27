import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.user.role, "NOTIFICATION_READ")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const unreadOnly = searchParams.get("unread") === "true";

  const notifications = await db.notification.findMany({
    where: {
      tenantId: session.user.tenantId ?? undefined,
      userId: session.user.id,
      ...(unreadOnly ? { readAt: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return Response.json(notifications);
}

// Bulk mark all notifications as read
export async function PATCH() {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.user.role, "NOTIFICATION_READ")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await db.notification.updateMany({
    where: {
      tenantId: session.user.tenantId ?? undefined,
      userId: session.user.id,
      readAt: null,
    },
    data: { isRead: true, readAt: new Date() },
  });

  return Response.json({ marked: result.count });
}
