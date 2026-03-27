import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { encryptField, decryptField } from "@/lib/encryption";
import { audit } from "@/lib/audit";
import { z } from "zod";
import { UserRole } from "@prisma/client";

const sendMessageSchema = z.object({
  matterId: z.string().optional(),
  recipientIds: z.array(z.string().min(1)).min(1),
  subject: z.string().max(200).optional(),
  body: z.string().min(1).max(5000),
  isInternal: z.boolean().default(false),
  parentId: z.string().optional(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { tenantId, role, id: userId } = session.user;
  if (!tenantId) return Response.json({ error: "No tenant" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const matterId = searchParams.get("matterId");

  const canReadAll = hasPermission(role, "MESSAGE_READ_ANY");

  // Get tenant encryption key for decryption
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { encryptionKeyId: true },
  });
  if (!tenant) return Response.json({ error: "Tenant not found" }, { status: 404 });

  const messages = await db.message.findMany({
    where: {
      tenantId,
      ...(matterId ? { matterId } : {}),
      // Users can see messages they sent or are recipients of
      ...(canReadAll
        ? {}
        : {
            OR: [
              { senderId: userId },
              { recipientIds: { has: userId } },
            ],
          }),
      // Clients cannot see internal messages
      ...(role === UserRole.CLIENT ? { isInternal: false } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      sender: { select: { id: true, firstName: true, lastName: true } },
      matter: { select: { id: true, title: true, matterNumber: true } },
    },
  });

  // Decrypt message bodies
  const decrypted = messages.map((msg) => ({
    id: msg.id,
    matterId: msg.matterId,
    senderId: msg.senderId,
    senderName: `${msg.sender.firstName} ${msg.sender.lastName}`,
    recipientIds: msg.recipientIds,
    subject: msg.subject,
    body: decryptField(msg.encBody, tenant.encryptionKeyId),
    isInternal: msg.isInternal,
    parentId: msg.parentId,
    status: msg.status,
    matter: msg.matter,
    createdAt: msg.createdAt,
  }));

  return Response.json(decrypted);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { tenantId, role, id: userId } = session.user;
  if (!tenantId) return Response.json({ error: "No tenant" }, { status: 400 });

  if (!hasPermission(role, "MESSAGE_SEND")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = sendMessageSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  // Clients cannot send internal messages
  if (role === UserRole.CLIENT && data.isInternal) {
    return Response.json({ error: "Clients cannot send internal messages" }, { status: 403 });
  }

  // Validate recipients belong to same tenant
  const recipients = await db.user.findMany({
    where: {
      id: { in: data.recipientIds },
      tenantUsers: { some: { tenantId, isActive: true } },
    },
    select: { id: true },
  });

  if (recipients.length !== data.recipientIds.length) {
    return Response.json({ error: "One or more recipients not found" }, { status: 400 });
  }

  // Get tenant encryption key
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { encryptionKeyId: true },
  });
  if (!tenant) return Response.json({ error: "Tenant not found" }, { status: 404 });

  // Validate matter belongs to tenant if provided
  if (data.matterId) {
    const matter = await db.matter.findFirst({
      where: { id: data.matterId, tenantId },
    });
    if (!matter) return Response.json({ error: "Matter not found" }, { status: 404 });
  }

  const encBody = encryptField(data.body, tenant.encryptionKeyId);

  const message = await db.message.create({
    data: {
      tenantId,
      senderId: userId,
      recipientIds: data.recipientIds,
      subject: data.subject,
      encBody,
      isInternal: data.isInternal,
      matterId: data.matterId,
      parentId: data.parentId,
    },
  });

  await audit.messageSent(
    {
      tenantId,
      userId,
      matterId: data.matterId,
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
    },
    message.id
  );

  return Response.json({ id: message.id, success: true }, { status: 201 });
}
