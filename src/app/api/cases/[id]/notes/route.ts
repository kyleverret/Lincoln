import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { encryptField } from "@/lib/encryption";
import { AuditAction } from "@prisma/client";
import { z } from "zod";

const createNoteSchema = z.object({
  content: z.string().min(1, "Note content is required").max(5000),
  isInternal: z.boolean().default(true),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.user.role, "MATTER_UPDATE")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: matterId } = await params;

  // Validate the matter belongs to the user's tenant
  const matter = await db.matter.findFirst({
    where: { id: matterId, tenantId: session.user.tenantId },
  });
  if (!matter) {
    return Response.json({ error: "Matter not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = createNoteSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { content, isInternal } = parsed.data;

  // Get tenant encryption key
  const tenant = await db.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: { encryptionKeyId: true },
  });
  if (!tenant?.encryptionKeyId) {
    return Response.json(
      { error: "Encryption key not configured" },
      { status: 500 }
    );
  }

  // Encrypt the note content
  const encContent = encryptField(content, tenant.encryptionKeyId);

  const note = await db.matterNote.create({
    data: {
      matterId,
      authorId: session.user.id,
      encContent,
      isInternal,
    },
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    matterId,
    action: AuditAction.MATTER_UPDATED,
    entityType: "MatterNote",
    entityId: note.id,
    description: `Note added to matter ${matter.matterNumber}`,
  });

  return Response.json(
    { id: note.id, createdAt: note.createdAt, isInternal: note.isInternal },
    { status: 201 }
  );
}
