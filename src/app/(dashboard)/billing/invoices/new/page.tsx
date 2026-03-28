"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LineItemType } from "@prisma/client";

interface Matter {
  id: string;
  title: string;
  matterNumber: string;
  hourlyRate: number | null;
  clients: { client: { id: string; firstName: string; lastName: string } }[];
}

interface LineItem {
  type: LineItemType;
  description: string;
  quantity: string;
  unitPrice: string;
}

const LINE_ITEM_TYPES: Record<LineItemType, string> = {
  TIME: "Time",
  EXPENSE: "Expense",
  FLAT_FEE: "Flat Fee",
  RETAINER_APPLIED: "Retainer Applied",
  OTHER: "Other",
};

export default function NewInvoicePage() {
  const router = useRouter();
  const [matters, setMatters] = useState<Matter[]>([]);
  const [selectedMatter, setSelectedMatter] = useState<Matter | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { type: "TIME", description: "", quantity: "1", unitPrice: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  useEffect(() => {
    fetch("/api/matters?include=clients")
      .then((r) => r.json())
      .then((data) => setMatters(Array.isArray(data) ? data : []));
  }, []);

  function updateLineItem(index: number, field: keyof LineItem, value: string) {
    setLineItems((prev) =>
      prev.map((li, i) => (i === index ? { ...li, [field]: value } : li))
    );
  }

  function addLineItem() {
    setLineItems((prev) => [
      ...prev,
      { type: "TIME", description: "", quantity: "1", unitPrice: "" },
    ]);
  }

  function removeLineItem(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  }

  const subtotal = lineItems.reduce((sum, li) => {
    const qty = parseFloat(li.quantity) || 0;
    const price = parseFloat(li.unitPrice) || 0;
    return sum + qty * price;
  }, 0);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const form = new FormData(e.currentTarget);
    const matterId = form.get("matterId") as string;
    const matter = matters.find((m) => m.id === matterId);
    const clientId = matter?.clients?.[0]?.client?.id;

    if (!clientId) {
      setError("No client found for this matter.");
      setSaving(false);
      return;
    }

    const body = {
      matterId,
      clientId,
      dueDate: form.get("dueDate"),
      notes: form.get("notes"),
      terms: form.get("terms"),
      lineItems: lineItems.map((li) => ({
        type: li.type,
        description: li.description,
        quantity: parseFloat(li.quantity) || 1,
        unitPrice: parseFloat(li.unitPrice) || 0,
      })),
    };

    const res = await fetch("/api/billing/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to create invoice");
      setSaving(false);
      return;
    }

    const invoice = await res.json();
    router.push(`/billing/invoices/${invoice.id}`);
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">New Invoice</h1>
        <p className="text-muted-foreground mt-1">Create an invoice for a matter</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Matter + due date */}
        <div className="rounded-lg border bg-white p-5 space-y-4">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
            Invoice Details
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Matter <span className="text-red-500">*</span>
              </label>
              <select
                name="matterId"
                required
                className="w-full rounded-md border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                onChange={(e) =>
                  setSelectedMatter(matters.find((m) => m.id === e.target.value) ?? null)
                }
              >
                <option value="">Select matter…</option>
                {matters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.matterNumber} — {m.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Due Date <span className="text-red-500">*</span>
              </label>
              <input
                name="dueDate"
                type="date"
                required
                defaultValue={thirtyDays}
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Terms</label>
              <input
                name="terms"
                placeholder="Net 30"
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="rounded-lg border bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
              Line Items
            </h2>
            <button
              type="button"
              onClick={addLineItem}
              className="text-xs text-primary hover:underline"
            >
              + Add line
            </button>
          </div>

          <div className="space-y-3">
            {lineItems.map((li, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-start">
                <div className="col-span-2">
                  <select
                    value={li.type}
                    onChange={(e) => updateLineItem(i, "type", e.target.value)}
                    className="w-full rounded-md border px-2 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {Object.entries(LINE_ITEM_TYPES).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-5">
                  <input
                    value={li.description}
                    onChange={(e) => updateLineItem(i, "description", e.target.value)}
                    placeholder="Description…"
                    required
                    className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="col-span-2">
                  <input
                    value={li.quantity}
                    onChange={(e) => updateLineItem(i, "quantity", e.target.value)}
                    type="number"
                    step="0.25"
                    min="0"
                    placeholder="Qty"
                    required
                    className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="col-span-2">
                  <input
                    value={li.unitPrice}
                    onChange={(e) => updateLineItem(i, "unitPrice", e.target.value)}
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Rate"
                    required
                    className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="col-span-1 flex items-center justify-end pt-2">
                  {lineItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLineItem(i)}
                      className="text-slate-400 hover:text-red-500 text-lg leading-none"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end border-t pt-3">
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Subtotal</p>
              <p className="text-xl font-bold">
                ${subtotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="rounded-lg border bg-white p-5">
          <label className="block text-sm font-medium mb-2">Notes (optional)</label>
          <textarea
            name="notes"
            rows={3}
            placeholder="Payment instructions, thank you note, etc."
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving || lineItems.length === 0}
            className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? "Creating…" : "Create Invoice"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
