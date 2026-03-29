import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Download, Lock, FolderOpen } from "lucide-react";
import Link from "next/link";
import {
  formatDate,
  formatFileSize,
  DOCUMENT_CATEGORY_LABELS,
} from "@/lib/utils";

export const metadata = { title: "My Documents" };

export default async function PortalDocumentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/portal/login");

  const client = await db.client.findFirst({
    where: { portalUserId: session.user.id },
  });

  if (!client) redirect("/portal/login");

  const documents = await db.document.findMany({
    where: {
      tenantId: client.tenantId,
      clientId: client.id,
      allowClientView: true,
      isActive: true,
    },
    orderBy: { createdAt: "desc" },
    include: {
      matter: { select: { id: true, title: true, matterNumber: true } },
      uploadedBy: { select: { firstName: true, lastName: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Your Documents</h1>
        <p className="text-muted-foreground mt-1">
          Documents shared with you by your legal team.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="h-4 w-4 text-green-600" />
            All documents are encrypted with AES-256-GCM
          </CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <FolderOpen className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-sm">
                No documents have been shared with you yet.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-4 py-4"
                >
                  <FileText className="h-8 w-8 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{doc.displayName}</p>
                    <div className="mt-0.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {doc.matter && (
                        <span>{doc.matter.matterNumber}: {doc.matter.title}</span>
                      )}
                      <Badge variant="secondary" className="text-xs">
                        {
                          DOCUMENT_CATEGORY_LABELS[
                            doc.category as keyof typeof DOCUMENT_CATEGORY_LABELS
                          ]
                        }
                      </Badge>
                      <span>{formatFileSize(doc.sizeBytes)}</span>
                      <span>Shared {formatDate(doc.createdAt)}</span>
                    </div>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/api/documents/${doc.id}/download`}>
                      <Download className="h-4 w-4" />
                      Download
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
