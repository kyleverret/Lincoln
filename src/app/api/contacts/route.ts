import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { z } from "zod";
import { ContactType } from "@prisma/client";

const createContactSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  company: z.string().max(200).optional().or(z.literal("")),
  title: z.string().max(200).optional().or(z.literal("")),
  type: z.nativeEnum(ContactType).default(ContactType.OTHER),
  matterId: z.string().optional(),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!hasPermission(session.user.role, "CONTACT_READ")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const matterId = searchParams.get("matterId");
  const search = searchParams.get("search");

  const contacts = await db.contact.findMany({
    where: {
      tenantId: session.user.tenantId ?? undefined,
      isActive: true,
      ...(matterId ? { matterId } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
              { company: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      matter: { select: { id: true, title: true, matterNumber: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 100,
  });

  return Response.json(contacts);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!hasPermission(session.user.role, "CONTACT_CREATE")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createContactSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const { matterId, email, phone, company, title, notes, ...rest } = parsed.data;

  // Validate matter belongs to tenant if provided
  if (matterId) {
    const matter = await db.matter.findFirst({
      where: { id: matterId, tenantId: session.user.tenantId ?? undefined },
    });
    if (!matter) {
      return Response.json({ error: "Matter not found" }, { status: 404 });
    }
  }

  const contact = await db.contact.create({
    data: {
      ...rest,
      email: email || null,
      phone: phone || null,
      company: company || null,
      title: title || null,
      notes: notes || null,
      tenantId: session.user.tenantId!,
      matterId: matterId || null,
    },
  });

  await writeAuditLog({
    tenantId: session.user.tenantId ?? undefined,
    userId: session.user.id,
    action: "CONTACT_CREATED",
    entityType: "Contact",
    entityId: contact.id,
    description: `Contact created: ${contact.firstName} ${contact.lastName}`,
  });

  return Response.json(contact, { status: 201 });
}
