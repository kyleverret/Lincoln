import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { hasAnyPermission } from "@/lib/permissions";
import Link from "next/link";
import { formatDistanceToNow, isPast, isWithinInterval, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import { AddTaskDialog } from "@/components/tasks/add-task-dialog";
import { KanbanSquare, List } from "lucide-react";

export const metadata = { title: "Tasks — Lincoln" };

export default async function TasksPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id: userId, tenantId, role } = session.user;

  if (!hasAnyPermission(role, ["MATTER_READ_ANY", "MATTER_READ_ASSIGNED"])) {
    redirect("/dashboard");
  }

  const now = new Date();
  const soon = addDays(now, 7);
  const canReadAll = role === UserRole.SUPER_ADMIN || role === UserRole.FIRM_ADMIN;

  // Pull all task cards (from TASK board) with due dates or without
  const [taskCards, matterDeadlines] = await Promise.all([
    db.kanbanCard.findMany({
      where: {
        column: {
          board: { tenantId: tenantId ?? undefined, boardType: "TASK" },
          isTerminal: false,
        },
        matter: canReadAll
          ? { tenantId: tenantId ?? undefined }
          : { tenantId: tenantId ?? undefined, assignments: { some: { userId } } },
      },
      include: {
        matter: { select: { id: true, title: true, matterNumber: true } },
        column: { select: { name: true, isTerminal: true } },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      take: 200,
    }),
    // Matter-level deadlines (statute of limitations, matter due dates)
    db.matter.findMany({
      where: {
        tenantId: tenantId ?? undefined,
        isActive: true,
        OR: [
          { dueDate: { lte: addDays(now, 14), gte: now } },
          { dueDate: { lt: now } },
          { statuteOfLimits: { lte: addDays(now, 30) } },
        ],
        ...(canReadAll ? {} : { assignments: { some: { userId } } }),
      },
      select: {
        id: true,
        title: true,
        matterNumber: true,
        dueDate: true,
        statuteOfLimits: true,
        status: true,
      },
      orderBy: { dueDate: "asc" },
      take: 50,
    }),
  ]);

  const overdue = taskCards.filter((c) => c.dueDate && isPast(c.dueDate));
  const dueSoon = taskCards.filter(
    (c) =>
      c.dueDate &&
      !isPast(c.dueDate) &&
      isWithinInterval(c.dueDate, { start: now, end: soon })
  );
  const upcoming = taskCards.filter((c) => c.dueDate && c.dueDate > soon);
  const noDueDate = taskCards.filter((c) => !c.dueDate);

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-8">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tasks</h1>
          <p className="text-muted-foreground mt-1">
            {taskCards.length} task{taskCards.length !== 1 ? "s" : ""} across all cases
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/tasks/board"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            <KanbanSquare className="h-4 w-4" />
            Board View
          </Link>
          <AddTaskDialog />
        </div>
      </div>

      {/* Matter-level deadlines */}
      {matterDeadlines.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Matter Deadlines
          </h2>
          <div className="space-y-2">
            {matterDeadlines.map((m) => {
              const isStatute =
                m.statuteOfLimits && m.statuteOfLimits <= addDays(now, 30);
              const deadline = isStatute ? m.statuteOfLimits! : m.dueDate!;
              const isUrgent =
                isPast(deadline) || deadline <= addDays(now, 3);
              return (
                <Link
                  key={m.id}
                  href={`/cases/${m.id}`}
                  className="flex items-center justify-between rounded-lg border bg-white p-4 hover:bg-slate-50 transition-colors"
                >
                  <div>
                    <p className="font-medium text-sm">{m.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.matterNumber}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "text-xs font-medium px-2 py-1 rounded-full",
                      isPast(deadline)
                        ? "bg-red-100 text-red-700"
                        : isUrgent
                        ? "bg-orange-100 text-orange-700"
                        : "bg-yellow-100 text-yellow-700"
                    )}
                  >
                    {isStatute ? "Statute: " : "Due: "}
                    {isPast(deadline)
                      ? `${formatDistanceToNow(deadline)} ago`
                      : `in ${formatDistanceToNow(deadline)}`}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {overdue.length > 0 && (
        <TaskSection title="Overdue" tasks={overdue} variant="overdue" now={now} />
      )}
      {dueSoon.length > 0 && (
        <TaskSection title="Due This Week" tasks={dueSoon} variant="soon" now={now} />
      )}
      {upcoming.length > 0 && (
        <TaskSection title="Upcoming" tasks={upcoming} variant="upcoming" now={now} />
      )}
      {noDueDate.length > 0 && (
        <TaskSection title="No Due Date" tasks={noDueDate} variant="none" now={now} />
      )}

      {taskCards.length === 0 && matterDeadlines.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg font-medium">No tasks yet</p>
          <p className="text-sm mt-1">
            Use the &ldquo;Add Task&rdquo; button to create your first task, or switch to Board View.
          </p>
        </div>
      )}
    </div>
  );
}

type TaskCard = Awaited<ReturnType<typeof db.kanbanCard.findMany>>[number] & {
  matter: { id: string; title: string; matterNumber: string };
  column: { name: string; isTerminal: boolean };
};

function TaskSection({
  title,
  tasks,
  variant,
  now,
}: {
  title: string;
  tasks: TaskCard[];
  variant: "overdue" | "soon" | "upcoming" | "none";
  now: Date;
}) {
  const variantStyles = {
    overdue: "text-red-700",
    soon: "text-orange-700",
    upcoming: "text-slate-500",
    none: "text-slate-400",
  };

  const priorityColors: Record<string, string> = {
    URGENT: "bg-red-100 text-red-700",
    HIGH: "bg-orange-100 text-orange-700",
    MEDIUM: "bg-blue-50 text-blue-700",
    LOW: "bg-slate-100 text-slate-500",
  };

  return (
    <section>
      <h2
        className={cn(
          "text-sm font-semibold uppercase tracking-wide mb-3",
          variantStyles[variant]
        )}
      >
        {title} ({tasks.length})
      </h2>
      <div className="space-y-2">
        {tasks.map((task) => (
          <div
            key={task.id}
            className="flex items-center justify-between rounded-lg border bg-white p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm truncate">{task.title}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <Link
                  href={`/cases/${task.matter.id}`}
                  className="text-xs text-primary hover:underline"
                >
                  {task.matter.matterNumber}
                </Link>
                <span className="text-xs text-slate-400">·</span>
                <span className="text-xs text-muted-foreground">
                  {task.matter.title}
                </span>
                <span className="text-xs text-slate-400">·</span>
                <span className="text-xs text-slate-400">{task.column.name}</span>
              </div>
            </div>
            <div className="ml-4 shrink-0 flex items-center gap-2">
              <span
                className={cn(
                  "text-xs font-medium px-2 py-0.5 rounded-full",
                  priorityColors[task.priority] ?? "bg-slate-100 text-slate-500"
                )}
              >
                {task.priority.charAt(0) + task.priority.slice(1).toLowerCase()}
              </span>
              {task.dueDate && (
                <span
                  className={cn(
                    "text-xs font-medium px-2 py-1 rounded-full hidden sm:inline",
                    variant === "overdue"
                      ? "bg-red-100 text-red-700"
                      : variant === "soon"
                      ? "bg-orange-100 text-orange-700"
                      : "bg-slate-100 text-slate-600"
                  )}
                >
                  {isPast(task.dueDate)
                    ? `${formatDistanceToNow(task.dueDate)} ago`
                    : `in ${formatDistanceToNow(task.dueDate)}`}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
