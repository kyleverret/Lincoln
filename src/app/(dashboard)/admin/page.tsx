import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Shield,
  Plus,
  Settings,
  Activity,
  UserCheck,
  UserX,
} from "lucide-react";
import Link from "next/link";
import { UserRole } from "@prisma/client";
import { hasPermission, ROLE_LABELS } from "@/lib/permissions";
import { notFound } from "next/navigation";
import { formatDate, formatDateTime } from "@/lib/utils";

export const metadata = { title: "Admin" };

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const { tenantId, role } = session.user;

  if (!hasPermission(role, "FIRM_DASHBOARD")) notFound();

  const [tenantUsers, recentAuditLogs, tenant] = await Promise.all([
    db.tenantUser.findMany({
      where: { tenantId, isActive: true },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            lastLoginAt: true,
            isActive: true,
            mfaEnabled: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.auditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        user: { select: { firstName: true, lastName: true } },
      },
    }),
    db.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        plan: true,
        isActive: true,
        createdAt: true,
        _count: {
          select: {
            clients: true,
            matters: true,
            documents: true,
          },
        },
      },
    }),
  ]);

  const mfaEnabledCount = tenantUsers.filter(
    (tu) => tu.user.mfaEnabled
  ).length;

  return (
    <div>
      <Header
        title="Administration"
        role={role}
        actions={
          <Button asChild size="sm">
            <Link href="/admin/users/new">
              <Plus className="h-4 w-4" />
              Add User
            </Link>
          </Button>
        }
      />

      <div className="p-6 space-y-6">
        {/* Firm overview */}
        {tenant && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Firm Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Clients</p>
                  <p className="text-xl font-bold">{tenant._count.clients}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Matters</p>
                  <p className="text-xl font-bold">{tenant._count.matters}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Documents</p>
                  <p className="text-xl font-bold">
                    {tenant._count.documents}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Users</p>
                  <p className="text-xl font-bold">{tenantUsers.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Security overview */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Security Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">MFA Adoption</span>
              <div className="flex items-center gap-2">
                <div className="h-2 w-32 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full"
                    style={{
                      width: `${
                        tenantUsers.length > 0
                          ? (mfaEnabledCount / tenantUsers.length) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <span className="text-sm font-medium">
                  {mfaEnabledCount}/{tenantUsers.length}
                </span>
              </div>
            </div>
            {mfaEnabledCount < tenantUsers.length && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
                {tenantUsers.length - mfaEnabledCount} user
                {tenantUsers.length - mfaEnabledCount !== 1 ? "s" : ""} have
                not enabled MFA. For HIPAA compliance, all users should use MFA.
              </p>
            )}
            <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded p-2">
              ✓ All documents encrypted with AES-256-GCM per-tenant keys
            </p>
            <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded p-2">
              ✓ Comprehensive audit logging enabled (HIPAA compliant)
            </p>
          </CardContent>
        </Card>

        {/* Users table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Team Members
            </CardTitle>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/users/new">
                <Plus className="h-4 w-4" />
                Add User
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <div className="divide-y">
                {tenantUsers.map((tu) => (
                  <div
                    key={tu.id}
                    className="flex items-center justify-between p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                        {tu.user.firstName[0]}{tu.user.lastName[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {tu.user.firstName} {tu.user.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {tu.user.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="hidden sm:flex items-center gap-2">
                        {tu.user.mfaEnabled ? (
                          <UserCheck className="h-4 w-4 text-green-600" aria-label="MFA enabled" />
                        ) : (
                          <UserX className="h-4 w-4 text-amber-500" aria-label="MFA not enabled" />
                        )}
                        <span className="text-xs text-muted-foreground">
                          {tu.user.lastLoginAt
                            ? formatDate(tu.user.lastLoginAt)
                            : "Never"}
                        </span>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {ROLE_LABELS[tu.role]}
                      </Badge>
                      {!tu.user.isActive && (
                        <Badge variant="destructive" className="text-xs">
                          Inactive
                        </Badge>
                      )}
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/admin/users/${tu.userId}`}>Edit</Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Audit log */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Recent Audit Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border divide-y text-xs">
              {recentAuditLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center gap-3 p-2.5"
                >
                  <span
                    className={`font-mono font-medium ${
                      log.success ? "text-green-700" : "text-red-600"
                    }`}
                  >
                    {log.action}
                  </span>
                  <span className="text-muted-foreground flex-1 truncate">
                    {log.user
                      ? `${log.user.firstName} ${log.user.lastName}`
                      : "System"}
                    {log.description ? ` — ${log.description}` : ""}
                  </span>
                  <span className="text-muted-foreground shrink-0">
                    {formatDateTime(log.createdAt)}
                  </span>
                </div>
              ))}
              {recentAuditLogs.length === 0 && (
                <p className="p-4 text-center text-muted-foreground">
                  No audit activity yet.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
