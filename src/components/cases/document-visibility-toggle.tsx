"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DocumentVisibilityToggleProps {
  documentId: string;
  displayName: string;
  allowClientView: boolean;
}

export function DocumentVisibilityToggle({
  documentId,
  displayName,
  allowClientView: initialValue,
}: DocumentVisibilityToggleProps) {
  const router = useRouter();
  const [allowClientView, setAllowClientView] = useState(initialValue);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function applyChange(newValue: boolean, confirmed = false) {
    setSaving(true);
    setError("");

    const res = await fetch(`/api/documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowClientView: newValue, confirmed }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to update visibility");
      setSaving(false);
      return;
    }

    setAllowClientView(newValue);
    setSaving(false);
    setShowConfirm(false);
    router.refresh();
  }

  function handleToggle() {
    if (!allowClientView) {
      // Turning on: require 2-step confirmation
      setShowConfirm(true);
    } else {
      // Turning off: no confirmation needed
      applyChange(false);
    }
  }

  return (
    <>
      <button
        onClick={handleToggle}
        disabled={saving}
        className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors disabled:opacity-50 ${
          allowClientView
            ? "bg-green-100 text-green-700 hover:bg-green-200"
            : "bg-slate-100 text-slate-500 hover:bg-slate-200"
        }`}
        title={allowClientView ? "Visible to client — click to hide" : "Hidden from client — click to share"}
      >
        {allowClientView ? (
          <Eye className="h-3 w-3" />
        ) : (
          <EyeOff className="h-3 w-3" />
        )}
        {allowClientView ? "Client visible" : "Hidden"}
      </button>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <h3 className="font-semibold text-sm">Share document with client?</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  <strong className="text-foreground">&ldquo;{displayName}&rdquo;</strong> will
                  become visible and downloadable by the client.
                </p>
              </div>
            </div>

            <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
              Some material may not be shared directly with clients based on NDAs,
              discovery rules, or court orders. By confirming, you are stating this
              document may be shared with and downloaded by the client.
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>
            )}

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowConfirm(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => applyChange(true, true)}
                disabled={saving}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {saving ? "Sharing..." : "Yes, share with client"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
