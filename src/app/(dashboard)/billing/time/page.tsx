"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface TimeEntry {
  id: string;
  date: string;
  hours: number;
  rate: number;
  description: string;
  isBillable: boolean;
  isBilled: boolean;
  matter: { id: string; title: string; matterNumber: string };
}

interface Matter {
  id: string;
  title: string;
  matterNumber: string;
  hourlyRate: number | null;
}

export default function TimeEntriesPage() {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/billing/time-entries").then((r) => r.json()),
      fetch("/api/matters").then((r) => r.json()),
    ]).then(([e, m]) => {
      setEntries(Array.isArray(e) ? e : []);
      setMatters(Array.isArray(m) ? m : []);
      setLoading(false);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const form = new FormData(e.currentTarget);
    const matterId = form.get("matterId") as string;
    const matter = matters.find((m) => m.id === matterId);

    const body = {
      matterId,
      date: form.get("date"),
      hours: parseFloat(form.get("hours") as string),
      rate: parseFloat(form.get("rate") as string),
      description: form.get("description"),
      isBillable: form.get("isBillable") === "on",
    };

    const res = await fetch("/api/billing/time-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to save");
      setSaving(false);
      return;
    }

    const newEntry = await res.json();
    setEntries((prev) => [newEntry, ...prev]);
    setShowForm(false);
    setSaving(false);
    (e.target as HTMLFormElement).reset();
  }

  const today = new Date().toISOString().split("T")[0];
  const totalHours = entries.reduce((s, e) => s + Number(e.hours), 0);
  const unbilledHours = entries
    .filter((e) => e.isBillable && !e.isBilled)
    .reduce((s, e) => s + Number(e.hours), 0);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Time Entries</h1>
          <p className="text-muted-foreground mt-1">
            {totalHours.toFixed(1)}h total · {unbilledHours.toFixed(1)}h unbilled
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/billing"
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            ← Billing
          </Link>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Log Time
          </button>
        </div>
      </div>

      {/* Log time form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-lg border bg-white p-5 space-y-4"
        >
          <h2 className="font-semibold">Log Time</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Matter <span className="text-red-500">*</span></label>
              <select
                name="matterId"
                required
                className="w-full rounded-md border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
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
              <label className="block text-sm font-medium mb-1">Date <span className="text-red-500">*</span></label>
              <input
                name="date"
                type="date"
                required
                defaultValue={today}
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Hours <span className="text-red-500">*</span></label>
              <input
                name="hours"
                type="number"
                step="0.25"
                min="0.25"
                max="24"
                required
                placeholder="1.5"
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Rate ($/hr) <span className="text-red-500">*</span></label>
              <input
                name="rate"
                type="number"
                step="0.01"
                min="0"
                required
                placeholder="250.00"
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Description <span className="text-red-500">*</span></label>
              <input
                name="description"
                required
                placeholder="Research and draft motion to dismiss…"
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input name="isBillable" type="checkbox" id="isBillable" defaultChecked />
            <label htmlFor="isBillable" className="text-sm">Billable</label>
          </div>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>
          )}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : "Save Entry"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Entries list */}
      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="font-medium">No time entries yet</p>
          <button
            onClick={() => setShowForm(true)}
            className="text-primary text-sm mt-2"
          >
            Log your first entry →
          </button>
        </div>
      ) : (
        <div className="rounded-lg border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Matter</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Description</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Hours</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {new Date(entry.date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/cases/${entry.matter.id}`} className="hover:underline text-primary">
                      {entry.matter.matterNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 max-w-xs truncate">{entry.description}</td>
                  <td className="px-4 py-3 text-right font-medium">{Number(entry.hours).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">
                    {entry.isBillable
                      ? `$${(Number(entry.hours) * Number(entry.rate)).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                      : <span className="text-muted-foreground text-xs">Non-billable</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {!entry.isBillable ? (
                      <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">N/A</span>
                    ) : entry.isBilled ? (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Billed</span>
                    ) : (
                      <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Unbilled</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
