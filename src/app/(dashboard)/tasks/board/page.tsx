import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { UserRole } from "@prisma/client";
import { hasPermission } from "@/lib/permissions";
import type { KanbanColumnData } from "@/components/cases/kanban-board";
import { KanbanBoardWrapper } from "@/components/cases/kanban-board-wrapper";
import Link from "next/link";
import { List } from "lucide-react";

export const metadata = { title: "Task Board" };

const TASK_BOARD_DEFAULTS = [
  { name: "To Do", color: "#6b7280", position: 0 },
  { name: "In Progress", color: "#3b82f6", position: 1 },
  { name: "In Review", color: "#f97316", position: 2 },
  { name: "Done", color: "#22c55e", position: 3, isTerminal: true },
];

export default async function TaskBoardPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const { tenantId, role, id: userId } = session.user;
  const canManage = hasPermission(role, "KANBAN_MANAGE");
  const canReadAll =
    role === UserRole.SUPER_ADMIN || role === UserRole.FIRM_ADMIN;

  const boardInclude = {
    columns: {
      orderBy: { position: "asc" as const },
      include: {
        cards: {
          orderBy: { position: "asc" as const },
          where: canReadAll
            ? {}
            : { matter: { assignments: { some: { userId } } } },
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
  };

  let board = await db.kanbanBoard.findFirst({
    where: { tenantId, boardType: "TASK", isActive: true },
    include: boardInclude,
  });

  // Bootstrap default task board if none exists
  if (!board) {
    board = await db.kanbanBoard.create({
      data: {
        tenantId,
        name: "Tasks",
        boardType: "TASK",
        isDefault: false,
        columns: { create: TASK_BOARD_DEFAULTS },
      },
      include: boardInclude,
    });
  }

  const columns: KanbanColumnData[] = board.columns.map((col) => ({
    id: col.id,
    name: col.name,
    color: col.color,
    position: col.position,
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
      <Header title="Task Board" role={role} />
      <div className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b bg-background">
        <Link
          href="/tasks"
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-slate-50 transition-colors"
        >
          <List className="h-4 w-4" />
          List View
        </Link>
        <span className="text-sm text-muted-foreground">
          Task columns are separate from the case project board.
        </span>
      </div>
      <div className="flex-1 overflow-hidden p-4 sm:p-6">
        <KanbanBoardWrapper
          columns={columns}
          canManage={canManage}
          boardId={board.id}
        />
      </div>
    </div>
  );
}
