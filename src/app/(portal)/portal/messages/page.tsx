import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { MessagesClient } from "@/components/messages/messages-client";

export const metadata = { title: "Messages" };

export default async function PortalMessagesPage() {
  const session = await auth();
  if (!session?.user) redirect("/portal/login");

  const { id: userId } = session.user;

  // Find the client record
  const client = await db.client.findFirst({
    where: { portalUserId: userId },
  });

  if (!client) redirect("/portal/login");

  // Fetch the client's active matters and their assigned attorneys
  const matterClients = await db.matterClient.findMany({
    where: {
      clientId: client.id,
      matter: { isActive: true },
    },
    include: {
      matter: {
        include: {
          assignments: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  });

  // Build contact list from attorneys assigned to the client's matters (deduplicated)
  const seenUserIds = new Set<string>();
  const contacts: { id: string; name: string; role: string }[] = [];
  for (const mc of matterClients) {
    for (const assignment of mc.matter.assignments) {
      if (!seenUserIds.has(assignment.user.id)) {
        seenUserIds.add(assignment.user.id);
        contacts.push({
          id: assignment.user.id,
          name: `${assignment.user.firstName} ${assignment.user.lastName}`,
          role: "Attorney",
        });
      }
    }
  }

  // Build matter list
  const matters = matterClients.map((mc) => ({
    id: mc.matter.id,
    title: mc.matter.title,
    matterNumber: mc.matter.matterNumber,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Messages</h1>
        <p className="text-muted-foreground mt-1">
          Send and receive messages with your legal team.
        </p>
      </div>
      <div className="border rounded-lg bg-white min-h-[500px] flex flex-col overflow-hidden">
        <MessagesClient
          contacts={contacts}
          matters={matters}
          currentUserId={userId}
          userRole={UserRole.CLIENT}
        />
      </div>
    </div>
  );
}
