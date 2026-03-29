import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  AlertTriangle,
  Clock,
  TrendingUp,
} from "lucide-react";
import { formatDate, STATUS_COLORS, STATUS_LABELS } from "@/lib/utils";
import { UserRole, MatterStatus } from "@prisma/client";
import Link from "next/link";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const { tenantId, role, id: userId } = session.user;

  // For SUPER_ADMIN without a tenant, show platform overview
  if (role === UserRole.SUPER_ADMIN && !tenantId) {
    redirect("/admin/platform");
  }

  // Determine which matters the user can see
  const matterWhere =
    role === UserRole.FIRM_ADMIN || role === UserRole.SUPER_ADMIN
      ? { tenantId }
      : {
          tenantId,
          assignments: { some: { userId } },
        };

  const [
    activeMatters,
    totalClients,
    urgentMatters,
    recentMatters,
    upcomingDeadlines,
  ] = await Promise.all([
    db.matter.count({
      where: { ...matterWhere, status: MatterStatus.ACTIVE, isActive: true },
    }),
    role === UserRole.FIRM_ADMIN || role === UserRole.SUPER_ADMIN
      ? db.client.count({ where: { tenantId, isActive: true } })
      : db.client.count({
          where: {
            tenantId,
            matters: {
              some: {
                matter: {
                  assignments: { some: { userId } },
                },
              },
            },
          },
        }),
    db.matter.count({
      where: { ...matterWhere, priority: "URGENT", isActive: true },
    }),
    db.matter.findMany({
      where: { ...matterWhere, isActive: true },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: {
        clients: {
          take: 1,
          include: { client: { select: { firstName: true, lastName: true } } },
        },
        practiceArea: { select: { name: true } },
      },
    }),
    db.matter.findMany({
      where: {
        ...matterWhere,
        isActive: true,
        dueDate: { gte: new Date(), lte: new Date(Date.now() + 14 * 86400000) },
      },
      orderBy: { dueDate: "asc" },
      take: 5,
      include: {
        clients: {
          take: 1,
          include: { client: { select: { firstName: true, lastName: true } } },
        },
      },
    }),
  ]);

  const stats = [
    {
      label: "Active Matters",
      value: activeMatters,
      icon: TrendingUp,
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      label: "Clients",
      value: totalClients,
      icon: Users,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
  ];

  return (
    <div>
      <Header
        title={`Good ${getGreeting()}, ${session.user.firstName}`}
        role={role}
      />

      <div className="p-4 sm:p-6 space-y-6">
        {/* Urgent alert */}
        {urgentMatters > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">
              {urgentMatters} urgent matter{urgentMatters !== 1 ? "s" : ""}{" "}
              require your attention.{" "}
              <Link href="/cases?priority=URGENT" className="underline">
                View now
              </Link>
            </p>
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className={`rounded-lg p-2 ${stat.bg}`}>
                      <Icon className={`h-5 w-5 ${stat.color}`} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{stat.value}</p>
                      <p className="text-sm text-muted-foreground">
                        {stat.label}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Recent Matters */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Recent Matters</CardTitle>
              <Link
                href="/cases"
                className="text-sm text-primary hover:underline"
              >
                View all
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentMatters.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No matters yet.
                </p>
              ) : (
                recentMatters.map((matter) => {
                  const primaryClient = matter.clients[0]?.client;
                  return (
                    <Link
                      key={matter.id}
                      href={`/cases/${matter.id}`}
                      className="flex items-center justify-between rounded-md p-2 hover:bg-muted transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {matter.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {primaryClient
                            ? `${primaryClient.firstName} ${primaryClient.lastName}`
                            : "No client"}{" "}
                          · {matter.matterNumber}
                        </p>
                      </div>
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
                    </Link>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Upcoming Deadlines */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Upcoming Deadlines (14 days)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {upcomingDeadlines.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No upcoming deadlines.
                </p>
              ) : (
                upcomingDeadlines.map((matter) => {
                  const primaryClient = matter.clients[0]?.client;
                  const daysUntil = matter.dueDate
                    ? Math.ceil(
                        (new Date(matter.dueDate).getTime() - Date.now()) /
                          86400000
                      )
                    : null;

                  return (
                    <Link
                      key={matter.id}
                      href={`/cases/${matter.id}`}
                      className="flex items-center justify-between rounded-md p-2 hover:bg-muted transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {matter.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {primaryClient
                            ? `${primaryClient.firstName} ${primaryClient.lastName}`
                            : "No client"}
                        </p>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className="text-xs font-medium">
                          {matter.dueDate ? formatDate(matter.dueDate) : ""}
                        </p>
                        {daysUntil !== null && (
                          <p
                            className={`text-xs ${
                              daysUntil <= 3
                                ? "text-red-600 font-medium"
                                : "text-muted-foreground"
                            }`}
                          >
                            {daysUntil === 0
                              ? "Today"
                              : daysUntil === 1
                              ? "Tomorrow"
                              : `${daysUntil} days`}
                          </p>
                        )}
                      </div>
                    </Link>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}
