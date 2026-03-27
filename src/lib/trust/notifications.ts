/**
 * Trust accounting notification helpers.
 * Creates in-app Notification records for retainer-low alerts,
 * IOLTA transfer approval requests, and stale account warnings.
 */

import { db } from "@/lib/db";
import { NotificationType } from "@prisma/client";
import { getMatterTrustBalance } from "./balance";

/**
 * Sends an in-app notification to one or more users.
 * Non-throwing — failures are logged but do not surface to callers.
 */
export async function sendNotification({
  tenantId,
  userIds,
  type,
  title,
  body,
  entityType,
  entityId,
}: {
  tenantId: string;
  userIds: string[];
  type: NotificationType;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
}): Promise<void> {
  try {
    await db.notification.createMany({
      data: userIds.map((userId) => ({
        tenantId,
        userId,
        type,
        title,
        body,
        entityType: entityType ?? null,
        entityId: entityId ?? null,
      })),
    });
  } catch (err) {
    console.error("[notifications] Failed to create notifications:", err);
  }
}

/**
 * After a trust transaction is written, checks whether the matter's balance
 * has fallen below the configured BillingRule floor and, if so, notifies
 * the relevant attorneys/staff.
 */
export async function checkRetainerAlert(
  tenantId: string,
  matterId: string,
  bankAccountId: string
): Promise<void> {
  const rule = await db.billingRule.findUnique({
    where: { matterId },
    include: {
      matter: {
        include: {
          assignments: {
            include: { user: { select: { id: true } } },
          },
        },
      },
    },
  });

  if (!rule || !rule.isActive) return;

  const balance = await getMatterTrustBalance(matterId, bankAccountId);

  let threshold = 0;
  if (rule.floorType === "STATIC" && rule.floorAmount) {
    threshold = Number(rule.floorAmount);
  } else if (rule.floorType === "PERCENTAGE" && rule.floorPercent) {
    // Use retainerAmount from matter as the reference
    const matter = await db.matter.findUnique({
      where: { id: matterId },
      select: { retainerAmount: true },
    });
    const base = Number(matter?.retainerAmount ?? 0);
    threshold = base * Number(rule.floorPercent);
  }

  if (balance > threshold) return;

  // Determine recipients
  let recipients = rule.matter.assignments.map((a) => a.user.id);
  if (rule.notifyLeadOnly) {
    const lead = rule.matter.assignments.find((a) => a.isLead);
    recipients = lead ? [lead.user.id] : recipients.slice(0, 1);
  }

  if (recipients.length === 0) return;

  await sendNotification({
    tenantId,
    userIds: recipients,
    type: NotificationType.RETAINER_LOW,
    title: "Retainer balance low",
    body: `Trust balance for matter ${matterId} has fallen below the configured threshold ($${balance.toFixed(2)} remaining).`,
    entityType: "Matter",
    entityId: matterId,
  });
}

/**
 * Notifies the approval queue (firm admins + lead attorney) that a
 * TRANSFER_OUT is pending their sign-off.
 */
export async function notifyTransferPending(
  tenantId: string,
  transactionId: string,
  matterId: string,
  amount: number
): Promise<void> {
  // Notify all FIRM_ADMIN users in the tenant
  const admins = await db.tenantUser.findMany({
    where: { tenantId, role: "FIRM_ADMIN", isActive: true },
    select: { userId: true },
  });

  // Also notify lead attorney on the matter
  const lead = await db.matterAssignment.findFirst({
    where: { matterId, isLead: true },
    select: { userId: true },
  });

  const userIds = [
    ...admins.map((a) => a.userId),
    ...(lead ? [lead.userId] : []),
  ].filter((v, i, arr) => arr.indexOf(v) === i); // dedupe

  await sendNotification({
    tenantId,
    userIds,
    type: NotificationType.IOLTA_APPROVAL_REQUESTED,
    title: "IOLTA transfer requires approval",
    body: `A transfer of $${amount.toFixed(2)} from trust to operating account is pending your approval.`,
    entityType: "TrustTransaction",
    entityId: transactionId,
  });
}
