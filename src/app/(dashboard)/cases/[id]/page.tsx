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
  Calendar,
  DollarSign,
  Users,
  FolderOpen,
  FileText,
  Edit,
  Lock,
  Building2,
  Gavel,
} from "lucide-react";
import {
  formatDate,
  formatDateTime,
  STATUS_COLORS,
  STATUS_LABELS,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  DOCUMENT_CATEGORY_LABELS,
  formatFileSize,
} from "@/lib/utils";
import { UserRole } from "@prisma/client";
import { audit } from "@/lib/audit";
import { headers } from "next/headers";
import Link from "next/link";
import { decryptField } from "@/lib/encryption";

export const metadata = { title: "Case Detail" };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CaseDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const { tenantId, role, id: userId } = session.user;
  const { id } = await params;

  const matter = await db.matter.findFirst({
    where: { id, tenantId, isActive: true },
    include: {
      clients: {
        include: {
          client: true,
        },
      },
      assignments: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      },
      practiceArea: true,
      documents: {
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          uploadedBy: {
            select: { firstName: true, lastName: true },
          },
        },
      },
      notes: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      _count: { select: { documents: true, notes: true, messages: true } },
    },
  });

  if (!matter) notFound();

  // Check access: non-admins must be assigned
  if (
    role !== UserRole.SUPER_ADMIN &&
    role !== UserRole.FIRM_ADMIN &&
    !matter.assignments.some((a) => a.userId === userId)
  ) {
    notFound();
  }

  // Audit: matter accessed
  const headersList = await headers();
  await audit.matterAccessed(
    {
      tenantId,
      userId,
      matterId: matter.id,
      ipAddress: headersList.get("x-forwarded-for") ?? undefined,
    },
    matter.id,
    matter.title
  );

  // Get tenant encryption key for note decryption
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { encryptionKeyId: true },
  });

  const canEdit =
    role === UserRole.SUPER_ADMIN ||
    role === UserRole.FIRM_ADMIN ||
    (role === UserRole.ATTORNEY &&
      matter.assignments.some((a) => a.userId === userId));

  return (
    <div>
      <Header
        title={matter.title}
        role={role}
        actions={
          canEdit ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/cases/${matter.id}/edit`}>
                <Edit className="h-4 w-4" />
                Edit
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="p-6 space-y-6">
        {/* Matter header card */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-start gap-4 justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold">{matter.title}</h2>
                  {matter.isConfidential && (
                    <Badge variant="outline" className="gap-1">
                      <Lock className="h-3 w-3" />
                      Confidential
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {matter.matterNumber}
                  {matter.caseNumber && ` · Court: ${matter.caseNumber}`}
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Badge
                    className={
                      STATUS_COLORS[
                        matter.status as keyof typeof STATUS_COLORS
                      ]
                    }
                    variant="outline"
                  >
                    {STATUS_LABELS[matter.status as keyof typeof STATUS_LABELS]}
                  </Badge>
                  <Badge
                    className={
                      PRIORITY_COLORS[
                        matter.priority as keyof typeof PRIORITY_COLORS
                      ]
                    }
                    variant="outline"
                  >
                    {
                      PRIORITY_LABELS[
                        matter.priority as keyof typeof PRIORITY_LABELS
                      ]
                    }
                  </Badge>
                  {matter.practiceArea && (
                    <Badge variant="secondary">{matter.practiceArea.name}</Badge>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>Opened {formatDate(matter.openedAt)}</span>
                </div>
                {matter.dueDate && (
                  <div
                    className={`flex items-center gap-2 ${
                      new Date(matter.dueDate) < new Date()
                        ? "text-red-600"
                        : "text-muted-foreground"
                    }`}
                  >
                    <Calendar className="h-4 w-4" />
                    <span>Due {formatDate(matter.dueDate)}</span>
                  </div>
                )}
                {matter.statuteOfLimits && (
                  <div className="flex items-center gap-2 text-amber-600">
                    <Calendar className="h-4 w-4" />
                    <span>SOL {formatDate(matter.statuteOfLimits)}</span>
                  </div>
                )}
                {matter.billingType && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <DollarSign className="h-4 w-4" />
                    <span>
                      {matter.billingType.replace("_", " ")}
                      {matter.hourlyRate &&
                        ` · $${matter.hourlyRate}/hr`}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {matter.description && (
              <>
                <Separator className="my-4" />
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {matter.description}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="documents">
              Documents ({matter._count.documents})
            </TabsTrigger>
            <TabsTrigger value="notes">Notes ({matter._count.notes})</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 grid gap-4 lg:grid-cols-2">
            {/* Clients */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" /> Clients
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {matter.clients.map((mc) => (
                  <div
                    key={mc.clientId}
                    className="flex items-center justify-between"
                  >
                    <Link
                      href={`/clients/${mc.clientId}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {mc.client.firstName} {mc.client.lastName}
                    </Link>
                    <div className="flex items-center gap-2">
                      {mc.isPrimary && (
                        <Badge variant="secondary" className="text-xs">
                          Primary
                        </Badge>
                      )}
                      {mc.role && (
                        <span className="text-xs text-muted-foreground">
                          {mc.role}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Assignments */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" /> Assigned Staff
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {matter.assignments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No assignments
                  </p>
                ) : (
                  matter.assignments.map((a) => (
                    <div
                      key={a.userId}
                      className="flex items-center justify-between"
                    >
                      <span className="text-sm font-medium">
                        {a.user.firstName} {a.user.lastName}
                      </span>
                      <div className="flex items-center gap-2">
                        {a.isLead && (
                          <Badge variant="secondary" className="text-xs">
                            Lead
                          </Badge>
                        )}
                        {a.role && (
                          <span className="text-xs text-muted-foreground">
                            {a.role}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Court Info */}
            {(matter.courtName || matter.judge || matter.opposingCounsel) && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Gavel className="h-4 w-4" /> Court Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {matter.courtName && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Court</span>
                      <span>{matter.courtName}</span>
                    </div>
                  )}
                  {matter.caseNumber && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Case #</span>
                      <span>{matter.caseNumber}</span>
                    </div>
                  )}
                  {matter.judge && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Judge</span>
                      <span>{matter.judge}</span>
                    </div>
                  )}
                  {matter.opposingCounsel && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Opposing Counsel
                      </span>
                      <span>{matter.opposingCounsel}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="documents" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">Documents</CardTitle>
                <Button asChild size="sm">
                  <Link href={`/documents/upload?matterId=${matter.id}`}>
                    Upload
                  </Link>
                </Button>
              </CardHeader>
              <CardContent>
                {matter.documents.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No documents uploaded yet.
                  </p>
                ) : (
                  <div className="divide-y">
                    {matter.documents.map((doc) => (
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
                              {
                                DOCUMENT_CATEGORY_LABELS[
                                  doc.category as keyof typeof DOCUMENT_CATEGORY_LABELS
                                ]
                              }{" "}
                              · {formatFileSize(doc.sizeBytes)} ·{" "}
                              {doc.uploadedBy.firstName}{" "}
                              {doc.uploadedBy.lastName} ·{" "}
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

          <TabsContent value="notes" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Case Notes</CardTitle>
              </CardHeader>
              <CardContent>
                {matter.notes.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No notes yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {matter.notes.map((note) => {
                      let content = "[encrypted]";
                      if (tenant?.encryptionKeyId) {
                        try {
                          content = decryptField(
                            note.encContent,
                            tenant.encryptionKeyId
                          );
                        } catch {
                          content = "[decryption error]";
                        }
                      }
                      return (
                        <div
                          key={note.id}
                          className="rounded-md border p-3 text-sm"
                        >
                          <p className="text-xs text-muted-foreground mb-1">
                            {formatDateTime(note.createdAt)}
                            {note.isInternal && (
                              <Badge
                                variant="outline"
                                className="ml-2 text-xs"
                              >
                                Internal
                              </Badge>
                            )}
                          </p>
                          <p className="whitespace-pre-wrap">{content}</p>
                        </div>
                      );
                    })}
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
