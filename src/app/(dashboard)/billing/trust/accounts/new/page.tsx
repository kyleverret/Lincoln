"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

const ACCOUNT_TYPES = ["IOLTA", "OPERATING", "ESCROW", "GENERAL"] as const;

export default function NewBankAccountPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    accountType: "IOLTA" as string,
    bankName: "",
    accountNumberLast4: "",
    routingNumber: "",
    staleThresholdDays: "7",
  });

  function handleChange(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/billing/trust/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        staleThresholdDays: parseInt(form.staleThresholdDays, 10) || 7,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to create account");
      setLoading(false);
      return;
    }

    const acct = await res.json();
    router.push(`/billing/trust/accounts/${acct.id}`);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/billing/trust">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Trust Accounting
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold">Add Bank Account</h1>
        <p className="text-muted-foreground mt-1">
          Configure a new trust or operating bank account.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Account Name *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => handleChange("name", e.target.value)}
                placeholder="e.g. Smith & Associates IOLTA"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="accountType">Account Type *</Label>
              <Select
                value={form.accountType}
                onValueChange={(v) => handleChange("accountType", v)}
              >
                <SelectTrigger id="accountType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bankName">Bank Name</Label>
                <Input
                  id="bankName"
                  value={form.bankName}
                  onChange={(e) => handleChange("bankName", e.target.value)}
                  placeholder="e.g. First National Bank"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="accountNumberLast4">Last 4 Digits</Label>
                <Input
                  id="accountNumberLast4"
                  value={form.accountNumberLast4}
                  onChange={(e) =>
                    handleChange(
                      "accountNumberLast4",
                      e.target.value.replace(/\D/g, "").slice(0, 4)
                    )
                  }
                  placeholder="1234"
                  maxLength={4}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="routingNumber">Routing Number</Label>
                <Input
                  id="routingNumber"
                  value={form.routingNumber}
                  onChange={(e) => handleChange("routingNumber", e.target.value)}
                  placeholder="021000021"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="staleThresholdDays">
                  Stale Alert Threshold (days)
                </Label>
                <Input
                  id="staleThresholdDays"
                  type="number"
                  min="1"
                  max="90"
                  value={form.staleThresholdDays}
                  onChange={(e) =>
                    handleChange("staleThresholdDays", e.target.value)
                  }
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" type="button" asChild>
                <Link href="/billing/trust">Cancel</Link>
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Saving…" : "Create Account"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
