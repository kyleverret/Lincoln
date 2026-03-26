"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";

export function ReconcileButton({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleReconcile() {
    setLoading(true);
    await fetch(`/api/billing/trust/accounts/${accountId}/reconcile`, {
      method: "POST",
    });
    router.refresh();
    setLoading(false);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleReconcile} disabled={loading}>
      <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
      {loading ? "Reconciling…" : "Mark Reconciled"}
    </Button>
  );
}
