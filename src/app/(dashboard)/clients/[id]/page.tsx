import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Edit,
  Mail,
  Phone,
  Building2,
  Shield,
  FileText,
  FolderOpen,
  User,
  ExternalLink,
} from "lucide-react";
import {
  formatDate,
  formatFileSize,
  DOCUMENT_CATEGORY_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
} from "@/lib/utils";
import { UserRole } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import Link from "next/link";
import { decryptField } from "@/lib/encryption";
import { hasPermission } from "@/lib/permissions";

export const metadata = { title: "Client Detail" };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ClientDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const { tenantId, role, id: userId } = session.user;
  const { id } = await params;

  // Permission check
  if (!hasPermission(role, "CLIENT_READ_ANY") && !hasPermission(role, "CLIENT_READ_ASSIGNED")) {
    notFound();
  }

  const client = await db.client.findFirst({
    where: { id, tenantId, isActive: true },
    include: {
      matters: {
        include: {
          matter: {
            select: {
              id: true,
              title: true,
              matterNumber: true,
              status: true,
              priority: true,
              openedAt: true,
              assignments: {
                include: {
                  user: {
                    select: { firstName: true, lastName: true },
                  },
                },
              },
            },
          },
        },
      },
      documents: {
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          uploadedBy: {
            select: { firstName: true, lastName: true },
          },
        },
      },
      _count: {
        select: { matters: true, documents: true, messages: true },
      },
    },
  });

  if (!client) notFound();

  // Non-admin users must be assigned to at least one of this client's matters
  if (
    role !== UserRole.SUPER_ADMIN &&
    role !== UserRole.FIRM_ADMIN
  ) {
    const hasAccess = client.matters.some((mc) =>
      mc.matter.assignments.some((a) => a.user && a.userId === userId)
    );
    if (!hasAccess) notFound();
  }

  // Audit: client accessed (HIPAA requirement)
  await writeAuditLog({
    tenantId,
    userId,
    action: "CLIENT_ACCESSED",
    entityType: "Client",
    entityId: client.id,
  });

  // Get tenant encryption key for PHI decryption
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { encryptionKeyId: true },
  });

  // Decrypt PHI fields
  let dateOfBirth: string | null = null;
  let ssnLastFour: string | null = null;
  let address: string | null = null;
  let notes: string | null = null;

  if (tenant?.encryptionKeyId) {
    try {
      if (client.encDateOfBirth) {
        dateOfBirth = decryptField(client.encDateOfBirth, tenant.encryptionKeyId);
      }
    } catch {
      dateOfBirth = "[decryption error]";
    }
    try {
      if (client.encSsnLastFour) {
        ssnLastFour = decryptField(client.encSsnLastFour, tenant.encryptionKeyId);
      }
    } catch {
      ssnLastFour = "[decryption error]";
    }
    try {
      if (client.encAddress) {
        address = decryptField(client.encAddress, tenant.encryptionKeyId);
      }
    } catch {
      address = "[decryption error]";
    }
    try {
      if (client.encNotes) {
        notes = decryptField(client.encNotes, tenant.encryptionKeyId);
      }
    } catch {
      notes = "[decryption error]";
    }
  }

  const canEdit =
    role === UserRole.SUPER_ADMIN ||
    role === UserRole.FIRM_ADMIN ||
    role === UserRole.ATTORNEY;

  // Determine if user can see PHI (admins and attorneys)
  const canViewPHI =
    role === UserRole.SUPER_ADMIN ||
    role === UserRole.FIRM_ADMIN ||
    role === UserRole.ATTORNEY;

  const activeMatters = client.matters.filter(
    (mc) => mc.matter.status === "ACTIVE" || mc.matter.status === "INTAKE"
  );

  return (
    <div>
      <Header
        title={`${client.firstName} ${client.lastName}`}
        role={role}
        actions={
          <div className="flex items-center gap-2">
            {canEdit && (
              <Button asChild size="sm" variant="outline">
                <Link href={`/clients/${client.id}/edit`}>
                  <Edit className="h-4 w-4" />
                  Edit
                </Link>
              </Button>
            )}
            <Button asChild size="sm" variant="ghost">
              <Link href="/clients">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </Button>
          </div>
        }
      />

      <div className="p-4 sm:p-6 space-y-6">
        {/* Client header card */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-start gap-4 justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
                  {client.firstName[0]}
                  {client.lastName[0]}
                </div>
                <div className="space-y-1">
                  <h2 className="text-xl font-bold">
                    {client.firstName} {client.lastName}
                  </h2>
                  {client.companyName && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5" />
                      {client.companyName}
                    </p>
                  )}
                  <div className="flex items-center gap-3 flex-wrap">
                    {client.email && (
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <Mail className="h-3.5 w-3.5" />
                        <a href={`mailto:${client.email}`} className="hover:underline">
                          {client.email}
                        </a>
                      </span>
                    )}
                    {client.phone && (
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5" />
                        {client.phone}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary">
                  {client.clientType === "BUSINESS" ? "Business" : "Individual"}
                </Badge>
                {client.portalEnabled && (
                  <Badge variant="secondary" className="gap-1">
                    <ExternalLink className="h-3 w-3" />
                    Portal Active
                  </Badge>
                )}
                {!client.conflictChecked && (
                  <Badge
                    variant="outline"
                    className="text-amber-600 border-amber-300"
                  >
                    Conflict pending
                  </Badge>
                )}
              </div>
            </div>

            <Separator className="my-4" />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Matters</p>
                <p className="font-medium">{client._count.matters}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Active</p>
                <p className="font-medium text-green-600">{activeMatters.length}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Documents</p>
                <p className="font-medium">{client._count.documents}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Since</p>
                <p className="font-medium">{formatDate(client.createdAt)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="matters">
              Matters ({client._count.matters})
            </TabsTrigger>
            <TabsTrigger value="documents">
              Documents ({client._count.documents})
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-4 grid gap-4 lg:grid-cols-2">
            {/* Contact Details */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4" /> Contact Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <span>{client.email || "---"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Phone</span>
                  <span>{client.phone || "---"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Company</span>
                  <span>{client.companyName || "---"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <span>{client.clientType === "BUSINESS" ? "Business" : "Individual"}</span>
                </div>
                {(client.city || client.state || client.zipCode) && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Location</span>
                    <span>
                      {[client.city, client.state, client.zipCode]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  </div>
                )}
                {client.referralSource && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Referral</span>
                    <span>{client.referralSource}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* PHI Section — only for authorized roles */}
            {canViewPHI && (dateOfBirth || ssnLastFour || address || notes) && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="h-4 w-4" /> Protected Information
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Encrypted at rest (HIPAA)
                  </p>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {dateOfBirth && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Date of Birth</span>
                      <span>{dateOfBirth}</span>
                    </div>
                  )}
                  {ssnLastFour && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">SSN (Last 4)</span>
                      <span>***-**-{ssnLastFour}</span>
                    </div>
                  )}
                  {address && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Address</span>
                      <span className="text-right max-w-[250px]">{address}</span>
                    </div>
                  )}
                  {notes && (
                    <div>
                      <p className="text-muted-foreground mb-1">Notes</p>
                      <p className="whitespace-pre-wrap text-sm rounded-md bg-muted p-3">
                        {notes}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Conflict Check */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Conflict Check</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge
                    variant={client.conflictChecked ? "secondary" : "outline"}
                    className={
                      client.conflictChecked
                        ? "text-green-700"
                        : "text-amber-600 border-amber-300"
                    }
                  >
                    {client.conflictChecked ? "Cleared" : "Pending"}
                  </Badge>
                </div>
                {client.conflictNotes && (
                  <div>
                    <p className="text-muted-foreground mb-1">Notes</p>
                    <p className="whitespace-pre-wrap">{client.conflictNotes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Matters Tab */}
          <TabsContent value="matters" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">Associated Matters</CardTitle>
              </CardHeader>
              <CardContent>
                {client.matters.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No matters associated with this client.
                  </p>
                ) : (
                  <div className="divide-y">
                    {client.matters.map((mc) => {
                      const m = mc.matter;
                      const leadAttorney = m.assignments.find((a) => a.isLead);
                      return (
                        <Link
                          key={m.id}
                          href={`/cases/${m.id}`}
                          className="flex items-center justify-between py-3 hover:bg-muted/50 px-2 rounded-md transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div>
                              <p className="text-sm font-medium">{m.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {m.matterNumber}
                                {leadAttorney &&
                                  ` · ${leadAttorney.user.firstName} ${leadAttorney.user.lastName}`}
                                {m.openedAt && ` · Opened ${formatDate(m.openedAt)}`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge
                              className={
                                STATUS_COLORS[
                                  m.status as keyof typeof STATUS_COLORS
                                ] || ""
                              }
                              variant="outline"
                            >
                              {STATUS_LABELS[
                                m.status as keyof typeof STATUS_LABELS
                              ] || m.status}
                            </Badge>
                            {mc.isPrimary && (
                              <Badge variant="secondary" className="text-xs">
                                Primary
                              </Badge>
                            )}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">Documents</CardTitle>
              </CardHeader>
              <CardContent>
                {client.documents.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No documents uploaded for this client.
                  </p>
                ) : (
                  <div className="divide-y">
                    {client.documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between py-3"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">
                              {doc.displayName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {DOCUMENT_CATEGORY_LABELS[
                                doc.category as keyof typeof DOCUMENT_CATEGORY_LABELS
                              ] || doc.category}{" "}
                              · {formatFileSize(doc.sizeBytes)} ·{" "}
                              {doc.uploadedBy.firstName} {doc.uploadedBy.lastName} ·{" "}
                              {formatDate(doc.createdAt)}
                            </p>
                          </div>
                        </div>
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/api/documents/${doc.id}/download`}>
                            Download
                          </Link>
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
