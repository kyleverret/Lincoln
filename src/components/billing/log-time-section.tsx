"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Plus } from "lucide-react";

interface TimeEntry {
  id: string;
  date: string | Date;
  hours: number | string;
  rate: number | string;
  description: string;
  isBillable: boolean;
  isBilled: boolean;
  user: { firstName: string; lastName: string };
}

interface LogTimeSectionProps {
  matterId: string;
  entries: TimeEntry[];
}

export function LogTimeSection({ matterId, entries: initialEntries }: LogTimeSectionProps) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const today = new Date().toISOString().split("T")[0];

  const totalHours = entries.reduce((s, e) => s + Number(e.hours), 0);
  const unbilledHours = entries
    .filter((e) => e.isBillable && !e.isBilled)
    .reduce((s, e) => s + Number(e.hours), 0);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const form = new FormData(e.currentTarget);
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
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Time Entries
          </CardTitle>
          {entries.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {totalHours.toFixed(1)}h total · {unbilledHours.toFixed(1)}h unbilled
            </p>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-4 w-4 mr-1" aria-label="Add" />
          Log Time
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="rounded-lg border bg-slate-50 p-4 space-y-3"
          >
            <h3 className="text-sm font-semibold">Log Time</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">
                  Date <span className="text-red-500">*</span>
                </label>
                <input
                  name="date"
                  type="date"
                  required
                  defaultValue={today}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Hours <span className="text-red-500">*</span>
                </label>
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
                <label className="block text-xs font-medium mb-1">
                  Rate ($/hr) <span className="text-red-500">*</span>
                </label>
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
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">
                Description <span className="text-red-500">*</span>
              </label>
              <input
                name="description"
                required
                placeholder="Research and draft motion to dismiss…"
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                name="isBillable"
                type="checkbox"
                id="isBillableCase"
                defaultChecked
              />
              <label htmlFor="isBillableCase" className="text-sm">
                Billable
              </label>
            </div>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">
                {error}
              </p>
            )}
            <div className="flex gap-2">
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

        {entries.length === 0 && !showForm ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No time entries yet. Click &ldquo;Log Time&rdquo; to add one.
          </p>
        ) : entries.length > 0 ? (
          <div className="divide-y">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between py-3 gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">{entry.description}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {entry.user.firstName} {entry.user.lastName} ·{" "}
                    {new Date(entry.date).toLocaleDateString()}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-medium">
                    {Number(entry.hours).toFixed(2)}h
                  </p>
                  {entry.isBillable ? (
                    <p className="text-xs text-muted-foreground">
                      $
                      {(
                        Number(entry.hours) * Number(entry.rate)
                      ).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                      })}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Non-billable</p>
                  )}
                </div>
                <div className="shrink-0">
                  {!entry.isBillable ? (
                    <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                      N/A
                    </span>
                  ) : entry.isBilled ? (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                      Billed
                    </span>
                  ) : (
                    <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                      Unbilled
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
