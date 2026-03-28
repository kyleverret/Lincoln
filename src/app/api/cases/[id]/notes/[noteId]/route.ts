import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { encryptField } from "@/lib/encryption";
import { AuditAction, UserRole } from "@prisma/client";
import { z } from "zod";

const updateNoteSchema = z.object({
  content: z.string().min(1, "Note content is required").max(5000),
});

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.user.role, "MATTER_UPDATE")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: matterId, noteId } = await params;
  const { id: userId, tenantId, role } = session.user;

  // Verify matter belongs to tenant
  const matter = await db.matter.findFirst({
    where: { id: matterId, tenantId },
    select: { id: true, matterNumber: true },
  });
  if (!matter) {
    return Response.json({ error: "Matter not found" }, { status: 404 });
  }

  // Fetch the note
  const note = await db.matterNote.findFirst({
    where: { id: noteId, matterId },
  });
  if (!note) {
    return Response.json({ error: "Note not found" }, { status: 404 });
  }

  const isAdmin =
    role === UserRole.SUPER_ADMIN || role === UserRole.FIRM_ADMIN;
  const isAuthor = note.authorId === userId;
  const withinEditWindow =
    Date.now() - note.createdAt.getTime() < TWENTY_FOUR_HOURS_MS;

  if (!isAdmin && (!isAuthor || !withinEditWindow)) {
    return Response.json(
      {
        error: isAuthor
          ? "Notes can only be edited within 24 hours of creation"
          : "You can only edit your own notes",
      },
      { status: 403 }
    );
  }

  const body = await req.json();
  const parsed = updateNoteSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { encryptionKeyId: true },
  });
  if (!tenant?.encryptionKeyId) {
    return Response.json(
      { error: "Encryption key not configured" },
      { status: 500 }
    );
  }

  const encContent = encryptField(parsed.data.content, tenant.encryptionKeyId);

  const updated = await db.matterNote.update({
    where: { id: noteId },
    data: { encContent },
  });

  await writeAuditLog({
    tenantId,
    userId,
    matterId,
    action: AuditAction.MATTER_UPDATED,
    entityType: "MatterNote",
    entityId: noteId,
    description: `Note edited on matter ${matter.matterNumber}`,
  });

  return Response.json({ id: updated.id, updatedAt: updated.updatedAt });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.user.role, "MATTER_UPDATE")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: matterId, noteId } = await params;
  const { id: userId, tenantId, role } = session.user;

  const matter = await db.matter.findFirst({
    where: { id: matterId, tenantId },
    select: { id: true, matterNumber: true },
  });
  if (!matter) {
    return Response.json({ error: "Matter not found" }, { status: 404 });
  }

  const note = await db.matterNote.findFirst({
    where: { id: noteId, matterId },
  });
  if (!note) {
    return Response.json({ error: "Note not found" }, { status: 404 });
  }

  const isAdmin =
    role === UserRole.SUPER_ADMIN || role === UserRole.FIRM_ADMIN;
  const isAuthor = note.authorId === userId;
  const withinEditWindow =
    Date.now() - note.createdAt.getTime() < TWENTY_FOUR_HOURS_MS;

  if (!isAdmin && (!isAuthor || !withinEditWindow)) {
    return Response.json(
      {
        error: isAuthor
          ? "Notes can only be deleted within 24 hours of creation"
          : "You can only delete your own notes",
      },
      { status: 403 }
    );
  }

  await db.matterNote.delete({ where: { id: noteId } });

  await writeAuditLog({
    tenantId,
    userId,
    matterId,
    action: AuditAction.MATTER_UPDATED,
    entityType: "MatterNote",
    entityId: noteId,
    description: `Note deleted from matter ${matter.matterNumber}`,
  });

  return new Response(null, { status: 204 });
}
