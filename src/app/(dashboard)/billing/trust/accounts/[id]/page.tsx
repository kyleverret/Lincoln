import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import { hasPermission } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Upload,
  RefreshCw,
  Link2,
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowRightLeft,
} from "lucide-react";
import Link from "next/link";
import { formatDate, formatDateTime } from "@/lib/utils";
import { TrustTransactionStatus, TrustTransactionType } from "@prisma/client";
import { ReconcileButton } from "./ReconcileButton";
import { CsvImportButton } from "./CsvImportButton";
import { PlaidLinkButton } from "./PlaidLinkButton";

export const metadata = { title: "Trust Account" };

const TYPE_ICONS: Record<TrustTransactionType, React.ElementType> = {
  DEPOSIT: ArrowDownCircle,
  WITHDRAWAL: ArrowUpCircle,
  TRANSFER_IN: ArrowRightLeft,
  TRANSFER_OUT: ArrowRightLeft,
  ADJUSTMENT: ArrowRightLeft,
};

const STATUS_COLORS: Record<TrustTransactionStatus, string> = {
  CLEARED: "text-green-600 border-green-200",
  PENDING_APPROVAL: "text-amber-600 border-amber-200",
  APPROVED: "text-blue-600 border-blue-200",
  REJECTED: "text-red-600 border-red-200",
};

export default async function TrustAccountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "TRUST_READ")) redirect("/billing");

  const { id } = await params;
  const tenantId = session.user.tenantId!;

  const account = await db.bankAccount.findFirst({
    where: { id, tenantId },
  });
  if (!account) notFound();

  const transactions = await db.trustTransaction.findMany({
    where: { bankAccountId: id, tenantId },
    include: {
      matter: { select: { id: true, title: true, matterNumber: true } },
    },
    orderBy: { date: "desc" },
    take: 200,
  });

  // Compute balance
  const credits = transactions
    .filter(
      (t) =>
        (t.type === "DEPOSIT" || t.type === "TRANSFER_IN") &&
        (t.status === TrustTransactionStatus.CLEARED ||
          t.status === TrustTransactionStatus.APPROVED)
    )
    .reduce((s, t) => s + Number(t.amount), 0);
  const debits = transactions
    .filter(
      (t) =>
        (t.type === "WITHDRAWAL" || t.type === "TRANSFER_OUT") &&
        (t.status === TrustTransactionStatus.CLEARED ||
          t.status === TrustTransactionStatus.APPROVED)
    )
    .reduce((s, t) => s + Number(t.amount), 0);
  const balance = credits - debits;

  // Matter breakdown
  const matterMap: Record<string, { label: string; credits: number; debits: number }> = {};
  for (const txn of transactions) {
    if (
      txn.status !== TrustTransactionStatus.CLEARED &&
      txn.status !== TrustTransactionStatus.APPROVED
    )
      continue;
    const key = txn.matterId;
    if (!matterMap[key]) {
      matterMap[key] = {
        label: `${txn.matter.matterNumber} — ${txn.matter.title}`,
        credits: 0,
        debits: 0,
      };
    }
    if (txn.type === "DEPOSIT" || txn.type === "TRANSFER_IN") {
      matterMap[key].credits += Number(txn.amount);
    } else {
      matterMap[key].debits += Number(txn.amount);
    }
  }
  const matterBreakdown = Object.entries(matterMap).map(([matterId, v]) => ({
    matterId,
    ...v,
    balance: v.credits - v.debits,
  }));

  const canManage = hasPermission(session.user.role, "BANK_ACCOUNT_MANAGE");
  const isPlaidConnected = !!account.plaidItemId;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/billing/trust">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Trust Accounting
          </Link>
        </Button>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{account.name}</h1>
          <div className="flex gap-3 mt-1 text-sm text-muted-foreground">
            <span>{account.accountType}</span>
            {account.bankName && <span>{account.bankName}</span>}
            {account.accountNumberLast4 && (
              <span>••••{account.accountNumberLast4}</span>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tabular-nums">${balance.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">Current Balance</p>
        </div>
      </div>

      {/* Action bar */}
      {canManage && (
        <div className="flex flex-wrap gap-2">
          <ReconcileButton accountId={id} />
          <CsvImportButton accountId={id} />
          {!isPlaidConnected ? (
            <PlaidLinkButton accountId={id} />
          ) : (
            <form action={`/api/billing/plaid/sync/${id}`} method="POST">
              <Button variant="outline" size="sm" type="submit">
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Sync Plaid
              </Button>
            </form>
          )}
        </div>
      )}

      {/* Reconciliation status */}
      <Card className={account.lastReconciledAt ? "" : "border-red-200"}>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Reconciliation Status</p>
              {account.lastReconciledAt ? (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Last reconciled {formatDateTime(account.lastReconciledAt)}
                </p>
              ) : (
                <p className="text-xs text-red-600 mt-0.5">
                  This account has never been reconciled
                </p>
              )}
            </div>
            {account.lastReconciledAt && (
              <Badge variant="outline" className="text-green-600 border-green-200">
                Reconciled
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Matter breakdown */}
      {matterBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Balance by Matter</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {matterBreakdown
                .sort((a, b) => b.balance - a.balance)
                .map((m) => (
                  <div
                    key={m.matterId}
                    className="flex items-center justify-between py-2 border-b last:border-0"
                  >
                    <Link
                      href={`/cases/${m.matterId}`}
                      className="text-sm hover:underline"
                    >
                      {m.label}
                    </Link>
                    <span
                      className={`text-sm font-semibold tabular-nums ${
                        m.balance < 0 ? "text-red-600" : ""
                      }`}
                    >
                      ${m.balance.toFixed(2)}
                    </span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transaction ledger */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transaction Ledger</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No transactions yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left pb-2 font-medium">Date</th>
                    <th className="text-left pb-2 font-medium">Description</th>
                    <th className="text-left pb-2 font-medium hidden md:table-cell">Matter</th>
                    <th className="text-left pb-2 font-medium hidden sm:table-cell">Status</th>
                    <th className="text-right pb-2 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((txn) => {
                    const Icon = TYPE_ICONS[txn.type];
                    const isCredit =
                      txn.type === "DEPOSIT" || txn.type === "TRANSFER_IN";
                    return (
                      <tr key={txn.id} className="border-b last:border-0">
                        <td className="py-2.5 pr-4 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(txn.date)}
                        </td>
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-1.5">
                            <Icon
                              className={`h-3.5 w-3.5 shrink-0 ${
                                isCredit ? "text-green-600" : "text-red-500"
                              }`}
                            />
                            <span className="truncate max-w-[200px]">
                              {txn.description}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-4 hidden md:table-cell">
                          <Link
                            href={`/cases/${txn.matter.id}`}
                            className="text-xs hover:underline text-muted-foreground"
                          >
                            {txn.matter.matterNumber}
                          </Link>
                        </td>
                        <td className="py-2.5 pr-4 hidden sm:table-cell">
                          <Badge
                            variant="outline"
                            className={`text-xs ${STATUS_COLORS[txn.status]}`}
                          >
                            {txn.status.replace("_", " ")}
                          </Badge>
                        </td>
                        <td
                          className={`py-2.5 text-right font-medium tabular-nums ${
                            isCredit ? "text-green-700" : "text-red-600"
                          }`}
                        >
                          {isCredit ? "+" : "-"}${Number(txn.amount).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
