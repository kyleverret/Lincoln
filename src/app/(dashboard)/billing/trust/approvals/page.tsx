"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, ArrowRightLeft, CheckCircle, XCircle } from "lucide-react";
import Link from "next/link";
import { formatDateTime } from "@/lib/utils";

interface PendingTxn {
  id: string;
  amount: string | number;
  description: string;
  date: string;
  matter: { id: string; title: string; matterNumber: string };
  bankAccount: { id: string; name: string };
  requestedBy: { firstName: string; lastName: string };
  createdAt: string;
}

export default function ApprovalsPage() {
  const [txns, setTxns] = useState<PendingTxn[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [showRejectFor, setShowRejectFor] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/billing/trust/transactions?status=PENDING_APPROVAL")
      .then((r) => r.json())
      .then((data) => {
        setTxns(data);
        setLoading(false);
      });
  }, []);

  async function handleAction(id: string, action: "approve" | "reject") {
    const reason = rejectReasons[id];
    if (action === "reject" && !reason?.trim()) {
      setShowRejectFor(id);
      return;
    }

    setActing(id);
    const body =
      action === "approve"
        ? { action: "approve" }
        : { action: "reject", reason };

    await fetch(`/api/billing/trust/transactions/${id}/approve`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setTxns((prev) => prev.filter((t) => t.id !== id));
    setActing(null);
    setShowRejectFor(null);
  }

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

      <div>
        <h1 className="text-2xl font-bold">IOLTA Transfer Approvals</h1>
        <p className="text-muted-foreground mt-1">
          Review and approve pending trust-to-operating transfers.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : txns.length === 0 ? (
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
            <p className="text-sm font-medium">All clear</p>
            <p className="text-xs text-muted-foreground mt-1">
              No transfers pending approval.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {txns.map((txn) => (
            <Card key={txn.id}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg p-2 bg-amber-50 mt-0.5">
                      <ArrowRightLeft className="h-4 w-4 text-amber-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">
                          ${Number(txn.amount).toFixed(2)} Transfer Out
                        </span>
                        <Badge
                          variant="outline"
                          className="text-amber-600 border-amber-200 text-xs"
                        >
                          Pending Approval
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {txn.description}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span>
                          Matter:{" "}
                          <Link
                            href={`/cases/${txn.matter.id}`}
                            className="hover:underline"
                          >
                            {txn.matter.matterNumber}
                          </Link>
                        </span>
                        <span>Account: {txn.bankAccount.name}</span>
                        <span>
                          Requested by: {txn.requestedBy.firstName}{" "}
                          {txn.requestedBy.lastName}
                        </span>
                        <span>{formatDateTime(txn.createdAt)}</span>
                      </div>

                      {showRejectFor === txn.id && (
                        <div className="mt-3 space-y-2">
                          <Textarea
                            placeholder="Reason for rejection (required)"
                            className="text-sm h-20"
                            value={rejectReasons[txn.id] ?? ""}
                            onChange={(e) =>
                              setRejectReasons((prev) => ({
                                ...prev,
                                [txn.id]: e.target.value,
                              }))
                            }
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={!rejectReasons[txn.id]?.trim() || acting === txn.id}
                              onClick={() => handleAction(txn.id, "reject")}
                            >
                              Confirm Rejection
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setShowRejectFor(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {showRejectFor !== txn.id && (
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-200 hover:bg-red-50"
                        disabled={acting === txn.id}
                        onClick={() => setShowRejectFor(txn.id)}
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        disabled={acting === txn.id}
                        onClick={() => handleAction(txn.id, "approve")}
                      >
                        <CheckCircle className="h-3.5 w-3.5 mr-1" />
                        {acting === txn.id ? "…" : "Approve"}
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
