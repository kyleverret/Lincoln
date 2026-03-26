import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Briefcase,
  FolderOpen,
  Clock,
  CheckCircle,
  AlertCircle,
  MessageSquare,
  Landmark,
} from "lucide-react";
import Link from "next/link";
import {
  formatDate,
  STATUS_COLORS,
  STATUS_LABELS,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
} from "@/lib/utils";
import { audit } from "@/lib/audit";
import { headers } from "next/headers";
import { TrustTransactionStatus } from "@prisma/client";

export const metadata = { title: "My Portal" };

export default async function PortalDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/portal/login");

  const client = await db.client.findFirst({
    where: { portalUserId: session.user.id },
    include: {
      matters: {
        include: {
          matter: {
            include: {
              assignments: {
                where: { isLead: true },
                take: 1,
                include: {
                  user: {
                    select: { firstName: true, lastName: true },
                  },
                },
              },
              _count: { select: { documents: true, messages: true } },
            },
          },
        },
      },
      _count: { select: { documents: true, messages: true } },
    },
  });

  if (!client) redirect("/portal/login");

  const matters = client.matters.map((mc) => mc.matter);

  // Compute trust balance per matter (matters with a trust account)
  const trustBalances: Record<string, number> = {};
  for (const matter of matters) {
    if (!matter.trustBankAccountId) continue;
    const agg = await db.trustTransaction.groupBy({
      by: ["type"],
      where: {
        matterId: matter.id,
        bankAccountId: matter.trustBankAccountId,
        status: { in: [TrustTransactionStatus.CLEARED, TrustTransactionStatus.APPROVED] },
      },
      _sum: { amount: true },
    });
    const credits = agg
      .filter((r) => r.type === "DEPOSIT" || r.type === "TRANSFER_IN")
      .reduce((s, r) => s + Number(r._sum.amount ?? 0), 0);
    const debits = agg
      .filter((r) => r.type === "WITHDRAWAL" || r.type === "TRANSFER_OUT")
      .reduce((s, r) => s + Number(r._sum.amount ?? 0), 0);
    trustBalances[matter.id] = credits - debits;
  }

  // Audit: client accessed portal
  const headersList = await headers();
  await audit.clientAccessed(
    {
      tenantId: client.tenantId,
      userId: session.user.id,
      clientId: client.id,
      ipAddress: headersList.get("x-forwarded-for") ?? undefined,
    },
    client.id
  );

  const activeMatters = matters.filter(
    (m) => m.status === "ACTIVE" || m.status === "INTAKE"
  );
  const closedMatters = matters.filter(
    (m) => m.status === "CLOSED" || m.status === "ARCHIVED"
  );

  const mattersWithTrust = matters.filter((m) => m.trustBankAccountId && trustBalances[m.id] !== undefined);

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold">
          Welcome back, {client.firstName}
        </h1>
        <p className="text-muted-foreground mt-1">
          Here&apos;s an overview of your matters and recent activity.
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            label: "Active Matters",
            value: activeMatters.length,
            icon: Briefcase,
            color: "text-blue-600",
            bg: "bg-blue-50",
          },
          {
            label: "Documents",
            value: client._count.documents,
            icon: FolderOpen,
            color: "text-purple-600",
            bg: "bg-purple-50",
          },
          {
            label: "Messages",
            value: client._count.messages,
            icon: MessageSquare,
            color: "text-green-600",
            bg: "bg-green-50",
          },
          {
            label: "Closed Matters",
            value: closedMatters.length,
            icon: CheckCircle,
            color: "text-slate-600",
            bg: "bg-slate-100",
          },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className={`rounded-lg p-2 ${stat.bg}`}>
                    <Icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-xl font-bold">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">
                      {stat.label}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Active matters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Briefcase className="h-4 w-4" />
            Your Matters
          </CardTitle>
        </CardHeader>
        <CardContent>
          {matters.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No active matters on file.
            </p>
          ) : (
            <div className="space-y-3">
              {matters.map((matter) => {
                const leadAttorney = matter.assignments[0]?.user;
                const isOverdue =
                  matter.dueDate && new Date(matter.dueDate) < new Date();

                return (
                  <Link
                    key={matter.id}
                    href={`/portal/cases/${matter.id}`}
                    className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{matter.title}</p>
                        {isOverdue && (
                          <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span>{matter.matterNumber}</span>
                        {leadAttorney && (
                          <span>
                            Attorney: {leadAttorney.firstName}{" "}
                            {leadAttorney.lastName}
                          </span>
                        )}
                        {matter.dueDate && (
                          <span
                            className={
                              isOverdue ? "text-red-600 font-medium" : ""
                            }
                          >
                            <Clock className="inline h-3 w-3 mr-0.5" />
                            {formatDate(matter.dueDate)}
                          </span>
                        )}
                        <span>
                          {matter._count.documents} doc
                          {matter._count.documents !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4 shrink-0">
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
          )}
        </CardContent>
      </Card>

      {/* Trust / Retainer Balances */}
      {mattersWithTrust.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Landmark className="h-4 w-4" />
              Retainer Balances
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {mattersWithTrust.map((matter) => {
                const balance = trustBalances[matter.id] ?? 0;
                return (
                  <div
                    key={matter.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{matter.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {matter.matterNumber}
                      </p>
                    </div>
                    <p
                      className={`font-semibold tabular-nums text-sm ${
                        balance < 0 ? "text-red-600" : "text-green-700"
                      }`}
                    >
                      ${balance.toFixed(2)}
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
