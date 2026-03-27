"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROLE_OPTIONS = [
  { value: "FIRM_ADMIN", label: "Firm Admin" },
  { value: "ATTORNEY", label: "Attorney" },
  { value: "STAFF", label: "Staff" },
];

interface UserData {
  id: string;
  tenantUserId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  role: string;
  title: string | null;
  department: string | null;
  isActive: boolean;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export default function AdminUserEditPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("STAFF");
  const [title, setTitle] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [lastLoginAt, setLastLoginAt] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/users/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load user");
        return r.json();
      })
      .then((data: UserData) => {
        setFirstName(data.firstName);
        setLastName(data.lastName);
        setEmail(data.email);
        setRole(data.role);
        setTitle(data.title || "");
        setIsActive(data.isActive);
        setMfaEnabled(data.mfaEnabled);
        setLastLoginAt(data.lastLoginAt);
        setCreatedAt(data.createdAt);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          role,
          title: title || null,
          isActive,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to update user");
      }

      setSuccess(true);
      setSaving(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Loading user...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Edit User</h1>
        <Button variant="outline" onClick={() => router.push("/admin")}>
          Back to Admin
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          User updated successfully.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* User Details */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">User Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  minLength={1}
                  maxLength={100}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  minLength={1}
                  maxLength={100}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Senior Partner, Paralegal"
                maxLength={200}
              />
            </div>
          </CardContent>
        </Card>

        {/* Role & Access */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Role & Access</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3">
              <Label htmlFor="isActive" className="cursor-pointer">
                Active
              </Label>
              <button
                id="isActive"
                type="button"
                role="switch"
                aria-checked={isActive}
                onClick={() => setIsActive(!isActive)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  isActive ? "bg-primary" : "bg-input"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                    isActive ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
              <span className="text-sm text-muted-foreground">
                {isActive ? "User can access the system" : "User is deactivated"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Account Info (read-only) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Account Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">MFA Status</span>
              <Badge variant={mfaEnabled ? "default" : "secondary"}>
                {mfaEnabled ? "Enabled" : "Not Enabled"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Last Login</span>
              <span>
                {lastLoginAt
                  ? new Date(lastLoginAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  : "Never"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Account Created</span>
              <span>
                {createdAt
                  ? new Date(createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "--"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/admin")}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
