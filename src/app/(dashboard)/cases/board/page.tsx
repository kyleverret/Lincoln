import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { hasPermission } from "@/lib/permissions";
import type { KanbanColumnData } from "@/components/cases/kanban-board";
import { KanbanBoardWrapper } from "@/components/cases/kanban-board-wrapper";

export const metadata = { title: "Case Board" };

export default async function BoardPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const { tenantId, role } = session.user;
  const canManage = hasPermission(role, "KANBAN_MANAGE");

  // Get or create default board for this tenant
  let board = await db.kanbanBoard.findFirst({
    where: { tenantId, isDefault: true, isActive: true },
    include: {
      columns: {
        orderBy: { position: "asc" },
        include: {
          cards: {
            orderBy: { position: "asc" },
            include: {
              matter: {
                include: {
                  clients: {
                    take: 1,
                    include: {
                      client: {
                        select: { firstName: true, lastName: true },
                      },
                    },
                  },
                  assignments: {
                    include: {
                      user: {
                        select: { firstName: true, lastName: true },
                      },
                    },
                  },
                  _count: { select: { documents: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  // Bootstrap default board if none exists
  if (!board) {
    board = await db.kanbanBoard.create({
      data: {
        tenantId,
        name: "Cases",
        isDefault: true,
        columns: {
          create: [
            { name: "Intake", color: "#8b5cf6", position: 0 },
            { name: "Active", color: "#22c55e", position: 1 },
            { name: "Pending Client", color: "#eab308", position: 2 },
            { name: "Pending Court", color: "#f97316", position: 3 },
            { name: "Closed", color: "#6b7280", position: 4, isTerminal: true },
          ],
        },
      },
      include: {
        columns: {
          orderBy: { position: "asc" },
          include: {
            cards: {
              orderBy: { position: "asc" },
              include: {
                matter: {
                  include: {
                    clients: {
                      take: 1,
                      include: {
                        client: { select: { firstName: true, lastName: true } },
                      },
                    },
                    assignments: {
                      include: {
                        user: { select: { firstName: true, lastName: true } },
                      },
                    },
                    _count: { select: { documents: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  // Transform to client-friendly data
  const columns: KanbanColumnData[] = board.columns.map((col) => ({
    id: col.id,
    name: col.name,
    color: col.color,
    position: col.position,
    isTerminal: col.isTerminal,
    wipLimit: col.wipLimit,
    cards: col.cards.map((card) => {
      const primaryClient = card.matter.clients[0]?.client;
      return {
        id: card.id,
        matterId: card.matterId,
        title: card.title,
        matterNumber: card.matter.matterNumber,
        priority: card.priority,
        status: card.matter.status,
        dueDate: card.dueDate ? card.dueDate.toISOString() : null,
        clientName: primaryClient
          ? `${primaryClient.firstName} ${primaryClient.lastName}`
          : null,
        assigneeNames: card.matter.assignments.map(
          (a) => `${a.user.firstName} ${a.user.lastName}`
        ),
        labels: card.labels,
        documentCount: card.matter._count.documents,
      };
    }),
  }));

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Case Board"
        role={role}
      />
      <div className="flex-1 overflow-hidden p-6">
        <KanbanBoardWrapper
          columns={columns}
          canManage={canManage}
          boardId={board.id}
        />
      </div>
    </div>
  );
}
