"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Shield } from "lucide-react";
import Link from "next/link";

export default function NewClientPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setFieldErrors({});

    const form = new FormData(e.currentTarget);

    const body: Record<string, unknown> = {
      firstName: form.get("firstName"),
      lastName: form.get("lastName"),
      email: form.get("email"),
      clientType: form.get("clientType") || "INDIVIDUAL",
    };

    // Optional fields — only include if non-empty
    const optionalFields = [
      "phone",
      "companyName",
      "dateOfBirth",
      "ssnLastFour",
      "address",
      "city",
      "state",
      "zipCode",
      "referralSource",
      "notes",
    ];
    for (const field of optionalFields) {
      const val = form.get(field);
      if (val && typeof val === "string" && val.trim()) {
        body[field] = val.trim();
      }
    }

    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.details?.fieldErrors) {
          setFieldErrors(data.details.fieldErrors);
        }
        throw new Error(data.error || `Server error (${res.status})`);
      }

      const client = await res.json();
      router.push(`/clients/${client.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create client");
      setSaving(false);
    }
  }

  return (
    <div>
      {/* Header — uses a static role since this is a client component;
          permission is enforced server-side by the API route */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b bg-background px-6">
        <h1 className="text-lg font-semibold">New Client</h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/clients">
            <ArrowLeft className="h-4 w-4" />
            Back to Clients
          </Link>
        </Button>
      </header>

      <div className="p-4 sm:p-6 max-w-3xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="firstName">
                    First Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="firstName"
                    name="firstName"
                    required
                    maxLength={100}
                    placeholder="First name"
                  />
                  {fieldErrors.firstName && (
                    <p className="text-xs text-red-500">{fieldErrors.firstName[0]}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">
                    Last Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="lastName"
                    name="lastName"
                    required
                    maxLength={100}
                    placeholder="Last name"
                  />
                  {fieldErrors.lastName && (
                    <p className="text-xs text-red-500">{fieldErrors.lastName[0]}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="email">
                    Email <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    required
                    placeholder="client@example.com"
                  />
                  {fieldErrors.email && (
                    <p className="text-xs text-red-500">{fieldErrors.email[0]}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    maxLength={20}
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="clientType">Client Type</Label>
                  <select
                    id="clientType"
                    name="clientType"
                    defaultValue="INDIVIDUAL"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="INDIVIDUAL">Individual</option>
                    <option value="BUSINESS">Business</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company / Organization</Label>
                  <Input
                    id="companyName"
                    name="companyName"
                    maxLength={200}
                    placeholder="Company name (if applicable)"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sensitive Information (PHI) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Sensitive Information
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                These fields are encrypted at rest (AES-256-GCM) for HIPAA compliance.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="dateOfBirth">Date of Birth</Label>
                  <Input
                    id="dateOfBirth"
                    name="dateOfBirth"
                    type="date"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ssnLastFour">SSN (Last 4)</Label>
                  <Input
                    id="ssnLastFour"
                    name="ssnLastFour"
                    maxLength={4}
                    pattern="\d{4}"
                    placeholder="1234"
                  />
                  {fieldErrors.ssnLastFour && (
                    <p className="text-xs text-red-500">{fieldErrors.ssnLastFour[0]}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  name="address"
                  maxLength={500}
                  placeholder="Street address"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input id="city" name="city" maxLength={100} placeholder="City" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Input id="state" name="state" maxLength={50} placeholder="State" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zipCode">Zip Code</Label>
                  <Input id="zipCode" name="zipCode" maxLength={20} placeholder="Zip" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Additional Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Additional Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="referralSource">Referral Source</Label>
                <Input
                  id="referralSource"
                  name="referralSource"
                  maxLength={200}
                  placeholder="How did this client find us?"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  maxLength={5000}
                  rows={4}
                  placeholder="Any additional notes about this client (encrypted at rest)"
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? "Creating..." : "Create Client"}
            </Button>
            <Button asChild variant="outline">
              <Link href="/clients">Cancel</Link>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
