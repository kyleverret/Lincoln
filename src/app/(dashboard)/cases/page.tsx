import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Search,
  Filter,
  Briefcase,
  Calendar,
  AlertCircle,
} from "lucide-react";
import {
  cn,
  formatDate,
  STATUS_COLORS,
  STATUS_LABELS,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
} from "@/lib/utils";
import { UserRole, MatterStatus, Priority } from "@prisma/client";
import { hasPermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { headers } from "next/headers";

export const metadata = { title: "Cases" };

interface PageProps {
  searchParams: Promise<{
    status?: string;
    priority?: string;
    q?: string;
  }>;
}

export default async function CasesPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const { tenantId, role, id: userId } = session.user;
  const params = await searchParams;

  const canSeeAll =
    role === UserRole.SUPER_ADMIN || role === UserRole.FIRM_ADMIN;

  const whereBase = canSeeAll
    ? { tenantId }
    : { tenantId, assignments: { some: { userId } } };

  const where: any = {
    ...whereBase,
    isActive: true,
  };

  if (params.status && Object.values(MatterStatus).includes(params.status as MatterStatus)) {
    where.status = params.status;
  }

  if (params.priority && Object.values(Priority).includes(params.priority as Priority)) {
    where.priority = params.priority;
  }

  if (params.q) {
    where.OR = [
      { title: { contains: params.q, mode: "insensitive" } },
      { matterNumber: { contains: params.q, mode: "insensitive" } },
      { caseNumber: { contains: params.q, mode: "insensitive" } },
    ];
  }

  const matters = await db.matter.findMany({
    where,
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    include: {
      clients: {
        take: 1,
        include: {
          client: { select: { firstName: true, lastName: true } },
        },
      },
      assignments: {
        where: { isLead: true },
        take: 1,
        include: {
          user: { select: { firstName: true, lastName: true } },
        },
      },
      practiceArea: { select: { name: true } },
      _count: { select: { documents: true, notes: true } },
    },
  });

  const canCreate = hasPermission(role, "MATTER_CREATE");

  return (
    <div>
      <Header
        title="Cases"
        role={role}
        actions={
          canCreate ? (
            <Button asChild size="sm">
              <Link href="/cases/new">
                <Plus className="h-4 w-4" />
                New Case
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="p-4 sm:p-6">
        {/* Filters */}
        <div className="mb-6 flex flex-col sm:flex-row flex-wrap gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <form>
              <input
                type="text"
                name="q"
                defaultValue={params.q}
                placeholder="Search cases..."
                className="h-9 rounded-md border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring w-full sm:w-64"
              />
            </form>
          </div>

          <div className="flex gap-2 flex-wrap">
            {[
              { label: "All", value: "" },
              ...Object.values(MatterStatus).map((s) => ({
                label: STATUS_LABELS[s],
                value: s,
              })),
            ].map((opt) => (
              <Link
                key={opt.value}
                href={`/cases${opt.value ? `?status=${opt.value}` : ""}`}
                className={`inline-flex h-9 items-center rounded-md border px-3 text-sm transition-colors ${
                  (params.status ?? "") === opt.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:bg-muted"
                }`}
              >
                {opt.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Case list */}
        {matters.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
            <Briefcase className="mb-3 h-10 w-10 text-muted-foreground" />
            <h3 className="text-lg font-medium">No cases found</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {canCreate
                ? "Get started by creating your first case."
                : "No cases are currently assigned to you."}
            </p>
            {canCreate && (
              <Button asChild className="mt-4" size="sm">
                <Link href="/cases/new">
                  <Plus className="h-4 w-4" />
                  New Case
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="rounded-lg border bg-background">
            <div className="divide-y">
              {matters.map((matter) => {
                const primaryClient = matter.clients[0]?.client;
                const leadAttorney = matter.assignments[0]?.user;
                const isUrgent = matter.priority === "URGENT";
                const isOverdue =
                  matter.dueDate && new Date(matter.dueDate) < new Date();

                return (
                  <Link
                    key={matter.id}
                    href={`/cases/${matter.id}`}
                    className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {matter.title}
                        </span>
                        {isUrgent && (
                          <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                        )}
                        {matter.isConfidential && (
                          <Badge variant="outline" className="text-xs">
                            Confidential
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span>{matter.matterNumber}</span>
                        {primaryClient && (
                          <span className="inline-flex items-center gap-0.5">
                            <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-teal-100 text-[9px] font-semibold text-teal-700 shrink-0">
                              C
                            </span>
                            {primaryClient.firstName} {primaryClient.lastName}
                          </span>
                        )}
                        {matter.practiceArea && (
                          <span>{matter.practiceArea.name}</span>
                        )}
                        {leadAttorney && (
                          <span className="inline-flex items-center gap-0.5">
                            <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-blue-100 text-[9px] font-semibold text-blue-700 shrink-0">
                              A
                            </span>
                            {leadAttorney.firstName} {leadAttorney.lastName}
                          </span>
                        )}
                        <span>
                          {matter._count.documents} doc
                          {matter._count.documents !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {matter.dueDate && (
                        <div className="text-right hidden sm:block">
                          <p className="text-xs text-muted-foreground">Due</p>
                          <p
                            className={`text-xs font-medium ${
                              isOverdue ? "text-red-600" : ""
                            }`}
                          >
                            <Calendar className="inline h-3 w-3 mr-0.5" />
                            {formatDate(matter.dueDate)}
                          </p>
                        </div>
                      )}
                      <Badge
                        className={cn(
                          PRIORITY_COLORS[
                            matter.priority as keyof typeof PRIORITY_COLORS
                          ],
                          "hidden sm:inline-flex"
                        )}
                        variant="outline"
                      >
                        {
                          PRIORITY_LABELS[
                            matter.priority as keyof typeof PRIORITY_LABELS
                          ]
                        }
                      </Badge>
                      <Badge
                        className={
                          STATUS_COLORS[
                            matter.status as keyof typeof STATUS_COLORS
                          ]
                        }
                        variant="outline"
                      >
                        {
                          STATUS_LABELS[
                            matter.status as keyof typeof STATUS_LABELS
                          ]
                        }
                      </Badge>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
