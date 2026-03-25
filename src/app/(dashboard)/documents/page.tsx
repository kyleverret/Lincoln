import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FileText,
  Upload,
  Download,
  FolderOpen,
  Lock,
  Eye,
} from "lucide-react";
import Link from "next/link";
import { UserRole } from "@prisma/client";
import {
  formatDate,
  formatFileSize,
  DOCUMENT_CATEGORY_LABELS,
} from "@/lib/utils";
import { hasPermission } from "@/lib/permissions";

export const metadata = { title: "Documents" };

interface PageProps {
  searchParams: Promise<{
    matterId?: string;
    clientId?: string;
    category?: string;
    q?: string;
  }>;
}

export default async function DocumentsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const { tenantId, role, id: userId } = session.user;
  const params = await searchParams;
  const canSeeAll =
    role === UserRole.SUPER_ADMIN || role === UserRole.FIRM_ADMIN;

  const where: any = { tenantId, isActive: true };

  if (!canSeeAll) {
    where.OR = [
      {
        matter: {
          assignments: { some: { userId } },
        },
      },
      { uploadedById: userId },
    ];
  }

  if (params.matterId) where.matterId = params.matterId;
  if (params.clientId) where.clientId = params.clientId;
  if (params.category) where.category = params.category;
  if (params.q) {
    where.OR = [
      { displayName: { contains: params.q, mode: "insensitive" } },
      { fileName: { contains: params.q, mode: "insensitive" } },
      { description: { contains: params.q, mode: "insensitive" } },
    ];
  }

  const documents = await db.document.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      matter: { select: { id: true, title: true, matterNumber: true } },
      client: { select: { id: true, firstName: true, lastName: true } },
      uploadedBy: { select: { firstName: true, lastName: true } },
    },
  });

  const totalSize = documents.reduce(
    (acc, d) => acc + Number(d.sizeBytes),
    0
  );

  const canUpload = hasPermission(role, "DOCUMENT_UPLOAD");

  // Group by category for display stats
  const byCategory = documents.reduce(
    (acc, doc) => {
      acc[doc.category] = (acc[doc.category] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div>
      <Header
        title="Documents"
        role={role}
        actions={
          canUpload ? (
            <Button asChild size="sm">
              <Link href="/documents/upload">
                <Upload className="h-4 w-4" />
                Upload
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6 flex items-center gap-3">
              <FolderOpen className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{documents.length}</p>
                <p className="text-sm text-muted-foreground">Total documents</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex items-center gap-3">
              <FileText className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">
                  {formatFileSize(totalSize)}
                </p>
                <p className="text-sm text-muted-foreground">Total size</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex items-center gap-3">
              <Lock className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-sm font-semibold text-green-700">
                  AES-256-GCM
                </p>
                <p className="text-sm text-muted-foreground">
                  All documents encrypted
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap gap-2">
          <Link
            href="/documents"
            className={`inline-flex h-8 items-center rounded-md border px-3 text-xs transition-colors ${
              !params.category
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background hover:bg-muted"
            }`}
          >
            All
          </Link>
          {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([cat, label]) => (
            <Link
              key={cat}
              href={`/documents?category=${cat}`}
              className={`inline-flex h-8 items-center rounded-md border px-3 text-xs transition-colors ${
                params.category === cat
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background hover:bg-muted"
              }`}
            >
              {label} {byCategory[cat] ? `(${byCategory[cat]})` : ""}
            </Link>
          ))}
        </div>

        {/* Document list */}
        {documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
            <FolderOpen className="mb-3 h-10 w-10 text-muted-foreground" />
            <h3 className="text-lg font-medium">No documents found</h3>
            {canUpload && (
              <Button asChild className="mt-4" size="sm">
                <Link href="/documents/upload">
                  <Upload className="h-4 w-4" />
                  Upload Document
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="rounded-lg border bg-background divide-y">
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-center gap-4 p-4">
                <FileText className="h-8 w-8 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{doc.displayName}</span>
                    {doc.isConfidential && (
                      <Badge variant="outline" className="text-xs gap-1">
                        <Lock className="h-3 w-3" />
                        Confidential
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-xs">
                      {
                        DOCUMENT_CATEGORY_LABELS[
                          doc.category as keyof typeof DOCUMENT_CATEGORY_LABELS
                        ]
                      }
                    </Badge>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {doc.matter && (
                      <Link
                        href={`/cases/${doc.matter.id}`}
                        className="hover:underline"
                      >
                        {doc.matter.matterNumber}: {doc.matter.title}
                      </Link>
                    )}
                    {doc.client && (
                      <Link
                        href={`/clients/${doc.client.id}`}
                        className="hover:underline"
                      >
                        {doc.client.firstName} {doc.client.lastName}
                      </Link>
                    )}
                    <span>{formatFileSize(doc.sizeBytes)}</span>
                    <span>
                      {doc.uploadedBy.firstName} {doc.uploadedBy.lastName}
                    </span>
                    <span>{formatDate(doc.createdAt)}</span>
                    <span>v{doc.version}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/api/documents/${doc.id}/download`}>
                      <Download className="h-4 w-4" />
                      Download
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
