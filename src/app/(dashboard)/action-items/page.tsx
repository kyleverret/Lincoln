import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { hasAnyPermission } from "@/lib/permissions";
import Link from "next/link";
import { formatDistanceToNow, isPast, isWithinInterval, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import { AddActionItemDialog } from "@/components/action-items/add-action-item-dialog";

export const metadata = { title: "Action Items — Lincoln" };

export default async function ActionItemsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id: userId, tenantId, role } = session.user;

  if (!hasAnyPermission(role, ["MATTER_READ_ANY", "MATTER_READ_ASSIGNED"])) {
    redirect("/dashboard");
  }

  const now = new Date();
  const soon = addDays(now, 7);

  // Pull kanban cards with due dates for matters this user can see
  const canReadAll = role === UserRole.SUPER_ADMIN || role === UserRole.FIRM_ADMIN;

  const cards = await db.kanbanCard.findMany({
    where: {
      dueDate: { not: null },
      column: { isTerminal: false },
      matter: canReadAll
        ? { tenantId: tenantId ?? undefined }
        : {
            tenantId: tenantId ?? undefined,
            assignments: { some: { userId } },
          },
    },
    include: {
      matter: { select: { id: true, title: true, matterNumber: true } },
      column: { select: { name: true } },
    },
    orderBy: { dueDate: "asc" },
    take: 100,
  });

  // Also pull matter-level deadlines (statute of limitations, due dates)
  const matterDeadlines = await db.matter.findMany({
    where: {
      tenantId: tenantId ?? undefined,
      isActive: true,
      OR: [
        { dueDate: { lte: soon, gte: now } },
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
  });

  const overdue = cards.filter((c) => c.dueDate && isPast(c.dueDate));
  const dueSoon = cards.filter(
    (c) =>
      c.dueDate &&
      !isPast(c.dueDate) &&
      isWithinInterval(c.dueDate, { start: now, end: soon })
  );
  const upcoming = cards.filter((c) => c.dueDate && c.dueDate > soon);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Action Items</h1>
          <p className="text-muted-foreground mt-1">
            Tasks and deadlines that need your attention
          </p>
        </div>
        <AddActionItemDialog />
      </div>

      {/* Matter-level deadlines */}
      {matterDeadlines.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Matter Deadlines
          </h2>
          <div className="space-y-2">
            {matterDeadlines.map((m) => {
              const isStatute = m.statuteOfLimits && m.statuteOfLimits <= addDays(now, 30);
              const deadline = isStatute ? m.statuteOfLimits! : m.dueDate!;
              const isUrgent = isPast(deadline) || deadline <= addDays(now, 3);
              return (
                <Link
                  key={m.id}
                  href={`/cases/${m.id}`}
                  className="flex items-center justify-between rounded-lg border bg-white p-4 hover:bg-slate-50 transition-colors"
                >
                  <div>
                    <p className="font-medium text-sm">{m.title}</p>
                    <p className="text-xs text-muted-foreground">{m.matterNumber}</p>
                  </div>
                  <div className="text-right">
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
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Overdue cards */}
      {overdue.length > 0 && (
        <CardSection
          title="Overdue"
          cards={overdue}
          variant="overdue"
          now={now}
        />
      )}

      {/* Due within 7 days */}
      {dueSoon.length > 0 && (
        <CardSection
          title="Due This Week"
          cards={dueSoon}
          variant="soon"
          now={now}
        />
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <CardSection
          title="Upcoming"
          cards={upcoming}
          variant="upcoming"
          now={now}
        />
      )}

      {overdue.length === 0 &&
        dueSoon.length === 0 &&
        upcoming.length === 0 &&
        matterDeadlines.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg font-medium">All clear</p>
            <p className="text-sm mt-1">No pending action items. Use the button above to add one.</p>
          </div>
        )}
    </div>
  );
}

type CardWithRelations = Awaited<
  ReturnType<typeof db.kanbanCard.findMany>
>[number] & {
  matter: { id: string; title: string; matterNumber: string };
  column: { name: string };
};

function CardSection({
  title,
  cards,
  variant,
  now,
}: {
  title: string;
  cards: CardWithRelations[];
  variant: "overdue" | "soon" | "upcoming";
  now: Date;
}) {
  const variantStyles = {
    overdue: "text-red-700",
    soon: "text-orange-700",
    upcoming: "text-slate-500",
  };

  return (
    <section>
      <h2
        className={cn(
          "text-sm font-semibold uppercase tracking-wide mb-3",
          variantStyles[variant]
        )}
      >
        {title} ({cards.length})
      </h2>
      <div className="space-y-2">
        {cards.map((card) => (
          <Link
            key={card.id}
            href={`/cases/${card.matter.id}`}
            className="flex items-center justify-between rounded-lg border bg-white p-4 hover:bg-slate-50 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm truncate">{card.title}</p>
              <p className="text-xs text-muted-foreground">
                {card.matter.matterNumber} · {card.matter.title} ·{" "}
                <span className="text-slate-400">{card.column.name}</span>
              </p>
            </div>
            <div className="ml-4 shrink-0">
              <span
                className={cn(
                  "text-xs font-medium px-2 py-1 rounded-full",
                  variant === "overdue"
                    ? "bg-red-100 text-red-700"
                    : variant === "soon"
                    ? "bg-orange-100 text-orange-700"
                    : "bg-slate-100 text-slate-600"
                )}
              >
                {isPast(card.dueDate!)
                  ? `${formatDistanceToNow(card.dueDate!)} ago`
                  : `in ${formatDistanceToNow(card.dueDate!)}`}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
