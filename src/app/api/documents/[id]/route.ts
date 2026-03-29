import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { AuditAction } from "@prisma/client";
import { z } from "zod";

const updateDocumentSchema = z.object({
  allowClientView: z.boolean(),
  // confirmed must be true when setting allowClientView = true
  confirmed: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.user.role, "DOCUMENT_UPLOAD")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { tenantId, id: userId } = session.user;

  const document = await db.document.findFirst({
    where: { id, tenantId, isActive: true },
    select: {
      id: true,
      matterId: true,
      displayName: true,
      allowClientView: true,
    },
  });

  if (!document) {
    return Response.json({ error: "Document not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = updateDocumentSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { allowClientView, confirmed } = parsed.data;

  // Require explicit confirmation when making a document visible to clients
  if (allowClientView && !document.allowClientView && !confirmed) {
    return Response.json(
      { error: "Confirmation required to make document visible to client" },
      { status: 422 }
    );
  }

  const updated = await db.document.update({
    where: { id },
    data: { allowClientView },
    select: { id: true, allowClientView: true },
  });

  // Audit the visibility change
  await writeAuditLog({
    tenantId,
    userId,
    matterId: document.matterId ?? undefined,
    action: AuditAction.DOCUMENT_UPLOADED,
    entityType: "Document",
    entityId: id,
    description: allowClientView
      ? `Document "${document.displayName}" visibility confirmed and shared with client`
      : `Document "${document.displayName}" hidden from client`,
  });

  return Response.json(updated);
}

/**
 * DELETE /api/documents/[id] — Soft-delete a document
 *
 * Sets isActive = false. The encrypted file remains in storage
 * for compliance/retention purposes. Only DOCUMENT_DELETE permission
 * holders can delete documents (SUPER_ADMIN, FIRM_ADMIN, ATTORNEY).
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.user.role, "DOCUMENT_DELETE")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { tenantId, id: userId } = session.user;

  const document = await db.document.findFirst({
    where: { id, tenantId, isActive: true },
    select: { id: true, matterId: true, displayName: true, fileName: true },
  });

  if (!document) {
    return Response.json({ error: "Document not found" }, { status: 404 });
  }

  await db.document.update({
    where: { id },
    data: { isActive: false },
  });

  await writeAuditLog({
    tenantId,
    userId,
    matterId: document.matterId ?? undefined,
    documentId: id,
    action: AuditAction.DOCUMENT_DELETED,
    entityType: "Document",
    entityId: id,
    description: `Deleted document: ${document.displayName ?? document.fileName}`,
  });

  return Response.json({ success: true });
}
