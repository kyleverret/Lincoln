/**
 * Trust balance computation helpers.
 * Balances are computed from the transaction ledger rather than stored,
 * to avoid drift. Call these inside Prisma transactions when writing
 * new TrustTransactions to ensure consistency.
 */

import { db } from "@/lib/db";
import { TrustTransactionStatus } from "@prisma/client";

/** Transaction types that increase the trust balance */
const CREDIT_TYPES = ["DEPOSIT", "TRANSFER_IN", "ADJUSTMENT"] as const;
/** Transaction types that decrease the trust balance */
const DEBIT_TYPES = ["WITHDRAWAL", "TRANSFER_OUT"] as const;

/**
 * Returns the current trust balance for a specific matter on a specific account.
 * Only counts CLEARED and APPROVED transactions.
 */
export async function getMatterTrustBalance(
  matterId: string,
  bankAccountId: string
): Promise<number> {
  const [credits, debits] = await Promise.all([
    db.trustTransaction.aggregate({
      where: {
        matterId,
        bankAccountId,
        type: { in: [...CREDIT_TYPES] },
        status: { in: [TrustTransactionStatus.CLEARED, TrustTransactionStatus.APPROVED] },
      },
      _sum: { amount: true },
    }),
    db.trustTransaction.aggregate({
      where: {
        matterId,
        bankAccountId,
        type: { in: [...DEBIT_TYPES] },
        status: { in: [TrustTransactionStatus.CLEARED, TrustTransactionStatus.APPROVED] },
      },
      _sum: { amount: true },
    }),
  ]);

  return (
    Number(credits._sum.amount ?? 0) - Number(debits._sum.amount ?? 0)
  );
}

/**
 * Returns the total trust balance across all matters for a bank account.
 */
export async function getAccountTrustBalance(bankAccountId: string): Promise<number> {
  const [credits, debits] = await Promise.all([
    db.trustTransaction.aggregate({
      where: {
        bankAccountId,
        type: { in: [...CREDIT_TYPES] },
        status: { in: [TrustTransactionStatus.CLEARED, TrustTransactionStatus.APPROVED] },
      },
      _sum: { amount: true },
    }),
    db.trustTransaction.aggregate({
      where: {
        bankAccountId,
        type: { in: [...DEBIT_TYPES] },
        status: { in: [TrustTransactionStatus.CLEARED, TrustTransactionStatus.APPROVED] },
      },
      _sum: { amount: true },
    }),
  ]);

  return (
    Number(credits._sum.amount ?? 0) - Number(debits._sum.amount ?? 0)
  );
}

/**
 * Checks whether a bank account's last reconciliation date exceeds its
 * configured stale threshold. Returns true if the account is stale.
 */
export function isAccountStale(
  lastReconciledAt: Date | null,
  staleThresholdDays: number
): boolean {
  if (!lastReconciledAt) return true;
  const staleMs = staleThresholdDays * 24 * 60 * 60 * 1000;
  return Date.now() - lastReconciledAt.getTime() > staleMs;
}
