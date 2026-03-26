import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { sendNotification } from "@/lib/trust/notifications";
import { checkRetainerAlert } from "@/lib/trust/notifications";
import { z } from "zod";
import { TrustTransactionStatus, NotificationType } from "@prisma/client";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("reject"), reason: z.string().min(1).max(500) }),
]);

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.user.role, "TRUST_TRANSFER_APPROVE")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const txn = await db.trustTransaction.findFirst({
    where: { id, tenantId: session.user.tenantId ?? undefined },
    include: { matter: { select: { id: true, matterNumber: true } } },
  });

  if (!txn) return Response.json({ error: "Not found" }, { status: 404 });
  if (txn.status !== TrustTransactionStatus.PENDING_APPROVAL) {
    return Response.json({ error: "Transaction is not pending approval" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Validation failed" }, { status: 400 });
  }

  const now = new Date();

  if (parsed.data.action === "approve") {
    const updated = await db.trustTransaction.update({
      where: { id },
      data: {
        status: TrustTransactionStatus.APPROVED,
        approvedById: session.user.id,
        approvedAt: now,
      },
    });

    // Notify requester
    await sendNotification({
      tenantId: session.user.tenantId!,
      userIds: [txn.requestedById],
      type: NotificationType.IOLTA_APPROVED,
      title: "IOLTA transfer approved",
      body: `Transfer of $${Number(txn.amount).toFixed(2)} from ${txn.matter.matterNumber} has been approved.`,
      entityType: "TrustTransaction",
      entityId: id,
    });

    // Check retainer alert after balance changes
    await checkRetainerAlert(session.user.tenantId!, txn.matterId, txn.bankAccountId).catch(() => {});

    await audit.writeAuditLog({
      tenantId: session.user.tenantId ?? undefined,
      userId: session.user.id,
      matterId: txn.matterId,
      action: "TRUST_TRANSFER_APPROVED",
      entityType: "TrustTransaction",
      entityId: id,
      description: `IOLTA transfer of $${Number(txn.amount).toFixed(2)} approved on ${txn.matter.matterNumber}`,
    });

    return Response.json(updated);
  } else {
    const updated = await db.trustTransaction.update({
      where: { id },
      data: {
        status: TrustTransactionStatus.REJECTED,
        approvedById: session.user.id,
        rejectedAt: now,
        rejectedReason: parsed.data.reason,
      },
    });

    await sendNotification({
      tenantId: session.user.tenantId!,
      userIds: [txn.requestedById],
      type: NotificationType.IOLTA_REJECTED,
      title: "IOLTA transfer rejected",
      body: `Transfer of $${Number(txn.amount).toFixed(2)} from ${txn.matter.matterNumber} was rejected: ${parsed.data.reason}`,
      entityType: "TrustTransaction",
      entityId: id,
    });

    await audit.writeAuditLog({
      tenantId: session.user.tenantId ?? undefined,
      userId: session.user.id,
      matterId: txn.matterId,
      action: "TRUST_TRANSFER_REJECTED",
      entityType: "TrustTransaction",
      entityId: id,
      description: `IOLTA transfer rejected: ${parsed.data.reason}`,
    });

    return Response.json(updated);
  }
}
