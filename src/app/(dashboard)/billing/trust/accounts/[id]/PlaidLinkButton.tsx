"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink } from "react-plaid-link";
import { Button } from "@/components/ui/button";
import { Link2 } from "lucide-react";

export function PlaidLinkButton({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { open, ready } = usePlaidLink({
    token: linkToken ?? "",
    onSuccess: async (publicToken, metadata) => {
      const plaidAccountId = metadata.accounts[0]?.id;
      if (!plaidAccountId) {
        setError("No account selected in Plaid Link");
        return;
      }

      const res = await fetch("/api/billing/plaid/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicToken, bankAccountId: accountId, plaidAccountId }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to connect Plaid");
      } else {
        router.refresh();
      }
    },
  });

  async function handleConnect() {
    setLoading(true);
    setError(null);

    const res = await fetch("/api/billing/plaid/link-token", { method: "POST" });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to create Plaid link");
      setLoading(false);
      return;
    }

    const data = await res.json();
    setLinkToken(data.link_token);
    setLoading(false);
  }

  // Once we have a link token and Plaid is ready, open
  const handleOpen = useCallback(() => {
    if (linkToken && ready) {
      open();
    } else {
      handleConnect();
    }
  }, [linkToken, ready, open]);

  return (
    <div>
      <Button variant="outline" size="sm" onClick={handleOpen} disabled={loading}>
        <Link2 className="h-3.5 w-3.5 mr-1.5" />
        {loading ? "Connecting…" : "Connect Plaid"}
      </Button>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
