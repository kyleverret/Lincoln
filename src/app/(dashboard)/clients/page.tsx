import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Users, Mail, Phone, ExternalLink } from "lucide-react";
import Link from "next/link";
import { UserRole } from "@prisma/client";
import { hasPermission } from "@/lib/permissions";

export const metadata = { title: "Clients" };

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function ClientsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const { tenantId, role, id: userId } = session.user;
  const params = await searchParams;

  const canSeeAll =
    role === UserRole.SUPER_ADMIN || role === UserRole.FIRM_ADMIN;

  const where: any = { tenantId, isActive: true };

  if (!canSeeAll) {
    // Staff/attorneys only see clients on their assigned matters
    where.matters = {
      some: {
        matter: { assignments: { some: { userId } } },
      },
    };
  }

  if (params.q) {
    where.OR = [
      { firstName: { contains: params.q, mode: "insensitive" } },
      { lastName: { contains: params.q, mode: "insensitive" } },
      { email: { contains: params.q, mode: "insensitive" } },
      { companyName: { contains: params.q, mode: "insensitive" } },
    ];
  }

  const clients = await db.client.findMany({
    where,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: {
      matters: {
        include: {
          matter: { select: { status: true } },
        },
      },
      _count: { select: { matters: true, documents: true } },
    },
  });

  const canCreate = hasPermission(role, "CLIENT_CREATE");

  return (
    <div>
      <Header
        title="Clients"
        role={role}
        actions={
          canCreate ? (
            <Button asChild size="sm">
              <Link href="/clients/new">
                <Plus className="h-4 w-4" />
                New Client
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="p-4 sm:p-6">
        {/* Search */}
        <div className="mb-6 flex flex-wrap gap-3">
          <form className="relative flex-1 sm:flex-none">
            <input
              type="text"
              name="q"
              defaultValue={params.q}
              placeholder="Search clients..."
              className="h-9 rounded-md border border-input bg-background pl-3 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring w-full sm:w-64"
            />
          </form>
          <Button asChild variant="outline" size="sm">
            <Link href="/clients/intake">
              <Plus className="h-4 w-4" />
              New Intake
            </Link>
          </Button>
        </div>

        {clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
            <Users className="mb-3 h-10 w-10 text-muted-foreground" />
            <h3 className="text-lg font-medium">No clients found</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {canCreate
                ? "Add your first client or start a client intake."
                : "No clients are assigned to your cases."}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border bg-background">
            <div className="divide-y">
              {clients.map((client) => {
                const activeMatters = client.matters.filter(
                  (m) =>
                    m.matter.status === "ACTIVE" ||
                    m.matter.status === "INTAKE"
                ).length;

                return (
                  <Link
                    key={client.id}
                    href={`/clients/${client.id}`}
                    className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                        {client.firstName[0]}{client.lastName[0]}
                      </div>
                      <div>
                        <p className="font-medium text-sm">
                          {client.firstName} {client.lastName}
                          {client.companyName && (
                            <span className="text-muted-foreground font-normal">
                              {" "}
                              · {client.companyName}
                            </span>
                          )}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          {client.email && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1 truncate max-w-[160px] sm:max-w-none">
                              <Mail className="h-3 w-3 shrink-0" />
                              <span className="truncate">{client.email}</span>
                            </span>
                          )}
                          {client.phone && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1 hidden sm:flex">
                              <Phone className="h-3 w-3" />
                              {client.phone}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right hidden sm:block">
                        <p className="text-xs text-muted-foreground">
                          {client._count.matters} matter
                          {client._count.matters !== 1 ? "s" : ""}
                        </p>
                        {activeMatters > 0 && (
                          <p className="text-xs text-green-600">
                            {activeMatters} active
                          </p>
                        )}
                      </div>
                      {client.portalEnabled && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <ExternalLink className="h-3 w-3" />
                          Portal
                        </Badge>
                      )}
                      {!client.conflictChecked && (
                        <Badge
                          variant="outline"
                          className="text-xs text-amber-600 border-amber-300"
                        >
                          Conflict pending
                        </Badge>
                      )}
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
