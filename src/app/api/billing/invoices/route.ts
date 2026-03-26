import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { z } from "zod";
import { InvoiceStatus, LineItemType } from "@prisma/client";

const lineItemSchema = z.object({
  type: z.nativeEnum(LineItemType).default(LineItemType.TIME),
  description: z.string().min(1).max(500),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  date: z.string().optional(),
  timeEntryId: z.string().optional(),
});

const createInvoiceSchema = z.object({
  matterId: z.string().min(1),
  clientId: z.string().min(1),
  dueDate: z.string().min(1),
  notes: z.string().max(2000).optional().or(z.literal("")),
  terms: z.string().max(100).optional().or(z.literal("")),
  taxRate: z.number().min(0).max(1).optional(),
  lineItems: z.array(lineItemSchema).min(1),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!hasPermission(session.user.role, "BILLING_READ")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const matterId = searchParams.get("matterId");
  const status = searchParams.get("status") as InvoiceStatus | null;

  const invoices = await db.invoice.findMany({
    where: {
      tenantId: session.user.tenantId ?? undefined,
      ...(matterId ? { matterId } : {}),
      ...(status ? { status } : {}),
    },
    include: {
      matter: { select: { id: true, title: true, matterNumber: true } },
      lineItems: true,
      payments: { select: { id: true, amount: true, paidAt: true, method: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return Response.json(invoices);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!hasPermission(session.user.role, "INVOICE_CREATE")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const { matterId, clientId, dueDate, notes, terms, taxRate, lineItems } = parsed.data;

  // Validate matter belongs to tenant
  const matter = await db.matter.findFirst({
    where: { id: matterId, tenantId: session.user.tenantId ?? undefined },
  });
  if (!matter) return Response.json({ error: "Matter not found" }, { status: 404 });

  // Generate invoice number
  const existing = await db.invoice.count({
    where: { tenantId: session.user.tenantId ?? undefined },
  });
  const year = new Date().getFullYear();
  const invoiceNumber = `INV-${year}-${String(existing + 1).padStart(4, "0")}`;

  // Calculate totals
  const subtotal = lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  const taxAmount = taxRate ? subtotal * taxRate : 0;
  const totalAmount = subtotal + taxAmount;

  const invoice = await db.invoice.create({
    data: {
      tenantId: session.user.tenantId!,
      matterId,
      clientId,
      invoiceNumber,
      dueDate: new Date(dueDate),
      notes: notes || null,
      terms: terms || null,
      taxRate: taxRate ?? null,
      taxAmount,
      subtotal,
      totalAmount,
      createdById: session.user.id,
      lineItems: {
        create: lineItems.map((li, i) => ({
          type: li.type,
          description: li.description,
          quantity: li.quantity,
          unitPrice: li.unitPrice,
          amount: li.quantity * li.unitPrice,
          date: li.date ? new Date(li.date) : null,
          timeEntryId: li.timeEntryId || null,
          position: i,
        })),
      },
    },
    include: { lineItems: true },
  });

  // Mark linked time entries as billed
  const timeEntryIds = lineItems
    .filter((li) => li.timeEntryId)
    .map((li) => li.timeEntryId!);

  if (timeEntryIds.length > 0) {
    await db.timeEntry.updateMany({
      where: { id: { in: timeEntryIds } },
      data: { isBilled: true },
    });
  }

  await audit.writeAuditLog({
    tenantId: session.user.tenantId ?? undefined,
    userId: session.user.id,
    matterId,
    action: "INVOICE_CREATED",
    entityType: "Invoice",
    entityId: invoice.id,
    description: `Invoice ${invoiceNumber} created for $${totalAmount.toFixed(2)}`,
  });

  return Response.json(invoice, { status: 201 });
}
