"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, Check, X } from "lucide-react";

export function ChangePasswordForm() {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  async function handleSave() {
    setError(null);
    setSuccess(false);

    if (form.newPassword !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/settings/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "password",
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        }),
      });

      if (res.ok) {
        setSuccess(true);
        setEditing(false);
        setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      } else {
        const data = await res.json();
        if (data.details && Array.isArray(data.details)) {
          setError(data.details.join(". "));
        } else {
          setError(data.error ?? "Failed to change password");
        }
      }
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setEditing(true);
            setSuccess(false);
          }}
        >
          <KeyRound className="h-3.5 w-3.5" />
          Change Password
        </Button>
        {success && (
          <span className="text-sm text-green-600">Password updated successfully</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-md border p-4">
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
      <div className="grid gap-4 sm:grid-cols-1 max-w-sm">
        <div className="space-y-1.5">
          <Label htmlFor="currentPassword">Current Password</Label>
          <Input
            id="currentPassword"
            type="password"
            value={form.currentPassword}
            onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="newPassword">New Password</Label>
          <Input
            id="newPassword"
            type="password"
            value={form.newPassword}
            onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Min 12 characters, uppercase, lowercase, number, and special character
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">Confirm Password</Label>
          <Input
            id="confirmPassword"
            type="password"
            value={form.confirmPassword}
            onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Check className="h-3.5 w-3.5" />
          {saving ? "Updating..." : "Update Password"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setEditing(false);
            setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
            setError(null);
          }}
          disabled={saving}
        >
          <X className="h-3.5 w-3.5" />
          Cancel
        </Button>
      </div>
    </div>
  );
}
