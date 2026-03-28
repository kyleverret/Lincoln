import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { isAccountStale } from "@/lib/trust/balance";
import { z } from "zod";
import { InvoiceStatus, PaymentMethod } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const updateInvoiceSchema = z.object({
  status: z.nativeEnum(InvoiceStatus).optional(),
  notes: z.string().max(2000).optional(),
  terms: z.string().max(100).optional(),
});

const recordPaymentSchema = z.object({
  action: z.literal("record_payment"),
  amount: z.number().positive(),
  method: z.nativeEnum(PaymentMethod).default(PaymentMethod.CHECK),
  reference: z.string().max(200).optional(),
  paidAt: z.string(),
  notes: z.string().max(500).optional(),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!hasPermission(session.user.role, "BILLING_READ")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const invoice = await db.invoice.findFirst({
    where: { id, tenantId: session.user.tenantId },
    include: {
      matter: { select: { id: true, title: true, matterNumber: true, billingType: true } },
      lineItems: { orderBy: { position: "asc" } },
      payments: { orderBy: { paidAt: "desc" } },
    },
  });

  if (!invoice) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json(invoice);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!hasPermission(session.user.role, "BILLING_WRITE")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const invoice = await db.invoice.findFirst({
    where: { id, tenantId: session.user.tenantId },
  });
  if (!invoice) return Response.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();

  // Handle record_payment action
  if (body.action === "record_payment") {
    if (!hasPermission(session.user.role, "PAYMENT_RECORD")) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = recordPaymentSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
    }

    const { amount, method, reference, paidAt, notes } = parsed.data;
    const newAmountPaid = new Decimal(invoice.amountPaid).add(new Decimal(amount));
    const newStatus = newAmountPaid.gte(new Decimal(invoice.totalAmount))
      ? InvoiceStatus.PAID
      : InvoiceStatus.PARTIAL;

    const [payment] = await db.$transaction([
      db.payment.create({
        data: {
          tenantId: session.user.tenantId,
          invoiceId: id,
          amount,
          method,
          reference: reference || null,
          paidAt: new Date(paidAt),
          notes: notes || null,
          recordedById: session.user.id,
        },
      }),
      db.invoice.update({
        where: { id },
        data: { amountPaid: newAmountPaid, status: newStatus },
      }),
    ]);

    await writeAuditLog({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "PAYMENT_RECORDED",
      entityType: "Invoice",
      entityId: id,
      description: `Payment of $${amount.toFixed(2)} recorded on invoice ${invoice.invoiceNumber}`,
    });

    return Response.json(payment);
  }

  // Standard status/notes update
  const parsed = updateInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  // Stale data lock: block DRAFT→SENT if matter's trust account is unreconciled past threshold
  if (parsed.data.status === InvoiceStatus.SENT && invoice.status === InvoiceStatus.DRAFT) {
    const matter = await db.matter.findFirst({
      where: { id: invoice.matterId },
      select: { trustBankAccountId: true },
    });
    if (matter?.trustBankAccountId) {
      const trustAccount = await db.bankAccount.findFirst({
        where: { id: matter.trustBankAccountId, tenantId: session.user.tenantId },
        select: { lastReconciledAt: true, staleThresholdDays: true },
      });
      if (trustAccount && isAccountStale(trustAccount.lastReconciledAt, trustAccount.staleThresholdDays ?? 7)) {
        return Response.json(
          { error: "Cannot send invoice: the matter's trust account has not been reconciled within the required period." },
          { status: 422 }
        );
      }
    }
  }

  const updated = await db.invoice.update({
    where: { id },
    data: parsed.data,
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "INVOICE_UPDATED",
    entityType: "Invoice",
    entityId: id,
    description: `Invoice ${invoice.invoiceNumber} updated`,
  });

  return Response.json(updated);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!hasPermission(session.user.role, "INVOICE_DELETE")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const invoice = await db.invoice.findFirst({
    where: { id, tenantId: session.user.tenantId },
  });
  if (!invoice) return Response.json({ error: "Not found" }, { status: 404 });

  if (invoice.status !== "DRAFT") {
    return Response.json(
      { error: "Only DRAFT invoices can be deleted" },
      { status: 400 }
    );
  }

  // Soft delete: set status to VOID instead of hard deleting compliance-sensitive data
  await db.invoice.update({
    where: { id },
    data: { status: "VOID" },
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "INVOICE_VOIDED",
    entityType: "Invoice",
    entityId: id,
    description: `Invoice ${invoice.invoiceNumber} voided (soft-deleted)`,
  });

  return new Response(null, { status: 204 });
}
