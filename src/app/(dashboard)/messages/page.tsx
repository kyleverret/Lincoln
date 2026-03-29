import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { UserRole } from "@prisma/client";
import { MessagesClient } from "@/components/messages/messages-client";

export const metadata = { title: "Messages" };

export default async function MessagesPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const { tenantId, role, id: userId } = session.user;

  // Fetch users in the tenant for the recipient picker
  const users = await db.user.findMany({
    where: {
      tenantUsers: { some: { tenantId, isActive: true } },
      id: { not: userId },
      isActive: true,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      tenantUsers: {
        where: { tenantId },
        select: { role: true },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const contactList = users.map((u) => ({
    id: u.id,
    name: `${u.firstName} ${u.lastName}`,
    role: u.tenantUsers[0]?.role ?? "STAFF",
  }));

  // Fetch matters for context linking
  const canSeeAll =
    role === UserRole.SUPER_ADMIN || role === UserRole.FIRM_ADMIN;
  const matters = await db.matter.findMany({
    where: canSeeAll
      ? { tenantId, isActive: true }
      : { tenantId, isActive: true, assignments: { some: { userId } } },
    select: { id: true, title: true, matterNumber: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return (
    <div className="flex flex-col h-full">
      <Header title="Messages" role={role} />
      <MessagesClient
        contacts={contactList}
        matters={matters}
        currentUserId={userId}
        userRole={role}
      />
    </div>
  );
}
