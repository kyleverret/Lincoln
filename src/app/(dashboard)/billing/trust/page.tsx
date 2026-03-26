import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Landmark,
  AlertTriangle,
  Clock,
  Plus,
  CheckCircle,
  ArrowRightLeft,
} from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { TrustTransactionStatus } from "@prisma/client";

export const metadata = { title: "Trust Accounting" };

export default async function TrustPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "TRUST_READ")) redirect("/billing");

  const tenantId = session.user.tenantId!;

  const [accounts, pendingApprovals] = await Promise.all([
    db.bankAccount.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
    }),
    db.trustTransaction.findMany({
      where: { tenantId, status: TrustTransactionStatus.PENDING_APPROVAL },
      include: {
        matter: { select: { id: true, title: true, matterNumber: true } },
        bankAccount: { select: { id: true, name: true } },
        requestedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 20,
    }),
  ]);

  // Compute per-account balances from ledger
  const accountBalances = await Promise.all(
    accounts.map(async (acct) => {
      const agg = await db.trustTransaction.groupBy({
        by: ["type"],
        where: {
          tenantId,
          bankAccountId: acct.id,
          status: { in: [TrustTransactionStatus.CLEARED, TrustTransactionStatus.APPROVED] },
        },
        _sum: { amount: true },
      });
      const credits = agg
        .filter((r) => r.type === "DEPOSIT" || r.type === "TRANSFER_IN")
        .reduce((s, r) => s + Number(r._sum.amount ?? 0), 0);
      const debits = agg
        .filter((r) => r.type === "WITHDRAWAL" || r.type === "TRANSFER_OUT")
        .reduce((s, r) => s + Number(r._sum.amount ?? 0), 0);
      return { id: acct.id, balance: credits - debits };
    })
  );
  const balanceMap = Object.fromEntries(accountBalances.map((b) => [b.id, b.balance]));
  const totalBalance = accountBalances.reduce((s, b) => s + b.balance, 0);

  // Stale accounts: lastReconciledAt older than staleThresholdDays (default 7)
  const staleAccounts = accounts.filter((acct) => {
    if (!acct.lastReconciledAt) return true;
    const thresholdDays = acct.staleThresholdDays ?? 7;
    const cutoff = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000);
    return acct.lastReconciledAt < cutoff;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Trust Accounting</h1>
          <p className="text-muted-foreground mt-1">
            IOLTA accounts, ledger, and reconciliation
          </p>
        </div>
        {hasPermission(session.user.role, "BANK_ACCOUNT_MANAGE") && (
          <Button asChild>
            <Link href="/billing/trust/accounts/new">
              <Plus className="h-4 w-4 mr-2" />
              Add Account
            </Link>
          </Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg p-2 bg-blue-50">
                <Landmark className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-xl font-bold">${totalBalance.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Total Trust Balance</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg p-2 bg-amber-50">
                <ArrowRightLeft className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-xl font-bold">{pendingApprovals.length}</p>
                <p className="text-xs text-muted-foreground">Pending Approvals</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className={`rounded-lg p-2 ${staleAccounts.length > 0 ? "bg-red-50" : "bg-green-50"}`}>
                {staleAccounts.length > 0 ? (
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                ) : (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                )}
              </div>
              <div>
                <p className="text-xl font-bold">{staleAccounts.length}</p>
                <p className="text-xs text-muted-foreground">Stale / Unreconciled</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending approval alert */}
      {pendingApprovals.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-800">
              <ArrowRightLeft className="h-4 w-4" />
              {pendingApprovals.length} Transfer{pendingApprovals.length !== 1 ? "s" : ""} Awaiting Approval
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" asChild>
              <Link href="/billing/trust/approvals">Review transfers</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stale alert */}
      {staleAccounts.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-red-800">
              <AlertTriangle className="h-4 w-4" />
              {staleAccounts.length} Account{staleAccounts.length !== 1 ? "s" : ""} Need Reconciliation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-red-700">
              Invoice finalization is blocked until these accounts are reconciled.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Bank accounts list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Landmark className="h-4 w-4" />
            Bank Accounts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No trust accounts configured yet.
            </p>
          ) : (
            <div className="space-y-2">
              {accounts.map((acct) => {
                const balance = balanceMap[acct.id] ?? 0;
                const isStale = staleAccounts.some((s) => s.id === acct.id);
                return (
                  <Link
                    key={acct.id}
                    href={`/billing/trust/accounts/${acct.id}`}
                    className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-sm">{acct.name}</p>
                      <div className="flex gap-3 mt-0.5 text-xs text-muted-foreground">
                        <span>{acct.accountType}</span>
                        {acct.bankName && <span>{acct.bankName}</span>}
                        {acct.lastReconciledAt ? (
                          <span>
                            <Clock className="inline h-3 w-3 mr-0.5" />
                            Reconciled {formatDate(acct.lastReconciledAt)}
                          </span>
                        ) : (
                          <span className="text-red-500">Never reconciled</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {isStale && (
                        <Badge variant="outline" className="text-red-600 border-red-200 text-xs">
                          Stale
                        </Badge>
                      )}
                      {acct.plaidItemId && (
                        <Badge variant="outline" className="text-blue-600 border-blue-200 text-xs">
                          Plaid
                        </Badge>
                      )}
                      <p className="font-semibold text-sm tabular-nums">
                        ${balance.toFixed(2)}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
