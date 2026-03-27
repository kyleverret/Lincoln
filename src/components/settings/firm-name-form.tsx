"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface FirmNameFormProps {
  currentName: string;
}

export function FirmNameForm({ currentName }: FirmNameFormProps) {
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = name.trim();
    if (!trimmed || trimmed === currentName) return;

    setSaving(true);
    setStatus("idle");
    setErrorMessage("");

    try {
      const res = await fetch("/api/settings/firm", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to update firm name");
      }

      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMessage(
        err instanceof Error ? err.message : "An unexpected error occurred"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="firm-name">Firm Name</Label>
        <Input
          id="firm-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setStatus("idle");
          }}
          placeholder="Enter firm name"
          disabled={saving}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving || !name.trim() || name.trim() === currentName}>
          {saving ? "Saving..." : "Save"}
        </Button>

        {status === "success" && (
          <span className="text-sm text-green-600">Firm name updated successfully.</span>
        )}
        {status === "error" && (
          <span className="text-sm text-red-600">{errorMessage}</span>
        )}
      </div>
    </form>
  );
}
