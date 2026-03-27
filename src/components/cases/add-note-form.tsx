"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";

interface AddNoteFormProps {
  matterId: string;
}

export function AddNoteForm({ matterId }: AddNoteFormProps) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [isInternal, setIsInternal] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;

    setSaving(true);
    setError("");
    setSuccess(false);

    try {
      const res = await fetch(`/api/cases/${matterId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim(), isInternal }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to add note");
        setSaving(false);
        return;
      }

      setContent("");
      setIsInternal(true);
      setSuccess(true);
      setSaving(false);

      // Refresh the page to show the new note
      router.refresh();

      // Clear success message after a few seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError("Failed to add note. Please try again.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mb-6">
      <Textarea
        placeholder="Add a note..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        required
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="isInternal"
            checked={isInternal}
            onChange={(e) => setIsInternal(e.target.checked)}
            className="rounded border-gray-300"
          />
          <Label htmlFor="isInternal" className="text-sm">
            Internal note (not visible to client)
          </Label>
        </div>
        <Button type="submit" size="sm" disabled={saving || !content.trim()}>
          {saving ? "Adding..." : "Add Note"}
        </Button>
      </div>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-green-600 bg-green-50 rounded px-3 py-2">
          Note added successfully.
        </p>
      )}
    </form>
  );
}
