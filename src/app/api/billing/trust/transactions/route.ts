import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { checkRetainerAlert, notifyTransferPending } from "@/lib/trust/notifications";
import { z } from "zod";
import { TrustTransactionType, TrustTransactionStatus } from "@prisma/client";

const createSchema = z.object({
  matterId: z.string().min(1),
  bankAccountId: z.string().min(1),
  type: z.nativeEnum(TrustTransactionType),
  amount: z.number().positive(),
  description: z.string().min(1).max(500),
  date: z.string().min(1),
  referenceNumber: z.string().max(200).optional().or(z.literal("")),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.user.role, "TRUST_READ")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const matterId = searchParams.get("matterId");
  const bankAccountId = searchParams.get("bankAccountId");
  const status = searchParams.get("status") as TrustTransactionStatus | null;

  const txns = await db.trustTransaction.findMany({
    where: {
      tenantId: session.user.tenantId ?? undefined,
      ...(matterId ? { matterId } : {}),
      ...(bankAccountId ? { bankAccountId } : {}),
      ...(status ? { status } : {}),
    },
    include: {
      matter: { select: { id: true, title: true, matterNumber: true } },
      bankAccount: { select: { id: true, name: true } },
    },
    orderBy: { date: "desc" },
    take: 500,
  });

  return Response.json(txns);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.user.role, "TRUST_WRITE")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const { matterId, bankAccountId, type, amount, description, date, referenceNumber } = parsed.data;

  // Validate matter and account belong to tenant
  const [matter, account] = await Promise.all([
    db.matter.findFirst({ where: { id: matterId, tenantId: session.user.tenantId ?? undefined } }),
    db.bankAccount.findFirst({ where: { id: bankAccountId, tenantId: session.user.tenantId ?? undefined } }),
  ]);
  if (!matter) return Response.json({ error: "Matter not found" }, { status: 404 });
  if (!account) return Response.json({ error: "Bank account not found" }, { status: 404 });

  // TRANSFER_OUT requires approval; all others go straight to CLEARED
  const needsApproval = type === TrustTransactionType.TRANSFER_OUT;
  const status = needsApproval
    ? TrustTransactionStatus.PENDING_APPROVAL
    : TrustTransactionStatus.CLEARED;

  const txn = await db.trustTransaction.create({
    data: {
      tenantId: session.user.tenantId!,
      matterId,
      bankAccountId,
      type,
      amount,
      description,
      date: new Date(date),
      referenceNumber: referenceNumber || null,
      status,
      requestedById: session.user.id,
    },
    include: {
      matter: { select: { id: true, title: true, matterNumber: true } },
    },
  });

  // Notify approval queue if pending
  if (needsApproval) {
    await notifyTransferPending(session.user.tenantId!, txn.id, matterId, amount).catch(() => {});
  } else {
    // Check if balance dropped below retainer alert threshold
    await checkRetainerAlert(session.user.tenantId!, matterId, bankAccountId).catch(() => {});
  }

  const auditAction =
    type === "DEPOSIT" ? "TRUST_DEPOSIT"
    : type === "WITHDRAWAL" ? "TRUST_WITHDRAWAL"
    : "TRUST_TRANSFER_REQUESTED";

  await audit.writeAuditLog({
    tenantId: session.user.tenantId ?? undefined,
    userId: session.user.id,
    matterId,
    action: auditAction,
    entityType: "TrustTransaction",
    entityId: txn.id,
    description: `${type} of $${amount.toFixed(2)} on ${matter.matterNumber} — ${description}`,
  });

  return Response.json(txn, { status: 201 });
}
