/**
 * Syncs transactions from Plaid into the trust ledger as CLEARED entries.
 * New transactions are placed in a "pending reconciliation" state —
 * they are imported as CLEARED but have isReconciled=false until an admin
 * manually matches them to matters via the reconciliation queue.
 *
 * Note: Plaid transactions are initially unmatched (no matterId).
 * This endpoint imports them into a staging concept via importBatchId;
 * the reconciliation UI lets admins assign them to matters.
 */

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { decryptField } from "@/lib/encryption";
import { writeAuditLog } from "@/lib/audit";
import { PlaidApi, PlaidEnvironments, Configuration, RemovedTransaction } from "plaid";
import { TrustTransactionType, TrustTransactionStatus } from "@prisma/client";

function getPlaidClient() {
  const env = process.env.PLAID_ENV ?? "sandbox";
  const config = new Configuration({
    basePath: PlaidEnvironments[env as keyof typeof PlaidEnvironments] ?? PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
        "PLAID-SECRET": process.env.PLAID_SECRET,
      },
    },
  });
  return new PlaidApi(config);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.user.role, "BANK_ACCOUNT_MANAGE")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
    return Response.json({ error: "Plaid is not configured" }, { status: 501 });
  }

  const { accountId } = await params;
  const account = await db.bankAccount.findFirst({
    where: { id: accountId, tenantId: session.user.tenantId ?? undefined },
  });
  if (!account) return Response.json({ error: "Not found" }, { status: 404 });
  if (!account.encPlaidAccessToken || !account.plaidAccountId) {
    return Response.json({ error: "Account is not connected to Plaid" }, { status: 400 });
  }

  const tenant = await db.tenant.findUnique({
    where: { id: session.user.tenantId! },
    select: { encryptionKeyId: true },
  });
  if (!tenant) return Response.json({ error: "Tenant not found" }, { status: 404 });

  const accessToken = decryptField(account.encPlaidAccessToken, tenant.encryptionKeyId);

  try {
    const client = getPlaidClient();
    // Sync from last sync date or 30 days back
    const startDate = account.plaidLastSyncedAt
      ? account.plaidLastSyncedAt.toISOString().split("T")[0]
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const endDate = new Date().toISOString().split("T")[0];

    const { data } = await client.transactionsGet({
      access_token: accessToken,
      start_date: startDate,
      end_date: endDate,
      options: { account_ids: [account.plaidAccountId] },
    });

    const importBatchId = `plaid-${Date.now()}`;
    let imported = 0;

    // Use a placeholder matter for unmatched transactions
    // Firm admins will match these via the reconciliation queue
    const placeholderMatter = await db.matter.findFirst({
      where: { tenantId: session.user.tenantId ?? undefined },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    if (!placeholderMatter) {
      return Response.json({ error: "No matters found to stage transactions against" }, { status: 400 });
    }

    for (const txn of data.transactions) {
      // Skip if already imported (idempotent by Plaid transaction ID stored as referenceNumber)
      const exists = await db.trustTransaction.findFirst({
        where: { referenceNumber: txn.transaction_id },
      });
      if (exists) continue;

      // Plaid amounts: positive = debit (money leaving account), negative = credit
      const type: TrustTransactionType =
        txn.amount > 0 ? TrustTransactionType.WITHDRAWAL : TrustTransactionType.DEPOSIT;
      const amount = Math.abs(txn.amount);

      await db.trustTransaction.create({
        data: {
          tenantId: session.user.tenantId!,
          matterId: placeholderMatter.id,
          bankAccountId: accountId,
          type,
          amount,
          description: txn.name,
          date: new Date(txn.date),
          referenceNumber: txn.transaction_id,
          status: TrustTransactionStatus.CLEARED,
          isReconciled: false, // needs manual matter assignment
          requestedById: session.user.id,
          importBatchId,
        },
      });
      imported++;
    }

    await db.bankAccount.update({
      where: { id: accountId },
      data: { plaidLastSyncedAt: new Date() },
    });

    await writeAuditLog({
      tenantId: session.user.tenantId ?? undefined,
      userId: session.user.id,
      action: "TRUST_DEPOSIT",
      entityType: "BankAccount",
      entityId: accountId,
      description: `Plaid sync: ${imported} new transactions imported`,
    });

    return Response.json({ imported, batchId: importBatchId });
  } catch (err: any) {
    console.error("[plaid] sync error:", err?.response?.data ?? err);
    return Response.json({ error: "Plaid sync failed" }, { status: 502 });
  }
}
