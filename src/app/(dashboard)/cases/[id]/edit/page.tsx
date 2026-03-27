"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_OPTIONS = [
  { value: "INTAKE", label: "Intake" },
  { value: "ACTIVE", label: "Active" },
  { value: "PENDING_CLIENT", label: "Pending Client" },
  { value: "PENDING_COURT", label: "Pending Court" },
  { value: "CLOSED", label: "Closed" },
  { value: "ARCHIVED", label: "Archived" },
];

const PRIORITY_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

const BILLING_TYPE_OPTIONS = [
  { value: "HOURLY", label: "Hourly" },
  { value: "FLAT_FEE", label: "Flat Fee" },
  { value: "CONTINGENCY", label: "Contingency" },
  { value: "PRO_BONO", label: "Pro Bono" },
];

interface MatterData {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  billingType: string | null;
  hourlyRate: number | null;
  flatFee: number | null;
  dueDate: string | null;
  courtName: string | null;
  caseNumber: string | null;
  judge: string | null;
  opposingCounsel: string | null;
}

export default function CaseEditPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [priority, setPriority] = useState("MEDIUM");
  const [billingType, setBillingType] = useState("HOURLY");
  const [hourlyRate, setHourlyRate] = useState("");
  const [flatFee, setFlatFee] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [courtName, setCourtName] = useState("");
  const [caseNumber, setCaseNumber] = useState("");
  const [judge, setJudge] = useState("");
  const [opposingCounsel, setOpposingCounsel] = useState("");

  useEffect(() => {
    fetch(`/api/cases/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load case");
        return r.json();
      })
      .then((data: MatterData) => {
        setTitle(data.title || "");
        setDescription(data.description || "");
        setStatus(data.status || "ACTIVE");
        setPriority(data.priority || "MEDIUM");
        setBillingType(data.billingType || "HOURLY");
        setHourlyRate(data.hourlyRate ? String(data.hourlyRate) : "");
        setFlatFee(data.flatFee ? String(data.flatFee) : "");
        setDueDate(
          data.dueDate
            ? new Date(data.dueDate).toISOString().split("T")[0]
            : ""
        );
        setCourtName(data.courtName || "");
        setCaseNumber(data.caseNumber || "");
        setJudge(data.judge || "");
        setOpposingCounsel(data.opposingCounsel || "");
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

    const body: Record<string, unknown> = {
      title,
      description: description || undefined,
      status,
      priority,
      billingType,
      courtName: courtName || undefined,
      caseNumber: caseNumber || undefined,
      judge: judge || undefined,
      opposingCounsel: opposingCounsel || undefined,
    };

    if (hourlyRate) body.hourlyRate = parseFloat(hourlyRate);
    if (flatFee) body.flatFee = parseFloat(flatFee);
    if (dueDate) body.dueDate = new Date(dueDate).toISOString();

    try {
      const res = await fetch(`/api/cases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to update case");
      }

      router.push(`/cases/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Loading case...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Edit Case</h1>
        <Button variant="outline" onClick={() => router.push(`/cases/${id}`)}>
          Cancel
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                minLength={2}
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                maxLength={2000}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Billing */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Billing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="billingType">Billing Type</Label>
              <Select value={billingType} onValueChange={setBillingType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select billing type" />
                </SelectTrigger>
                <SelectContent>
                  {BILLING_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="hourlyRate">Hourly Rate ($)</Label>
                <Input
                  id="hourlyRate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="flatFee">Flat Fee ($)</Label>
                <Input
                  id="flatFee"
                  type="number"
                  step="0.01"
                  min="0"
                  value={flatFee}
                  onChange={(e) => setFlatFee(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Court Information */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Court Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="courtName">Court Name</Label>
                <Input
                  id="courtName"
                  value={courtName}
                  onChange={(e) => setCourtName(e.target.value)}
                  maxLength={200}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="caseNumber">Case Number</Label>
                <Input
                  id="caseNumber"
                  value={caseNumber}
                  onChange={(e) => setCaseNumber(e.target.value)}
                  maxLength={100}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="judge">Judge</Label>
                <Input
                  id="judge"
                  value={judge}
                  onChange={(e) => setJudge(e.target.value)}
                  maxLength={200}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="opposingCounsel">Opposing Counsel</Label>
                <Input
                  id="opposingCounsel"
                  value={opposingCounsel}
                  onChange={(e) => setOpposingCounsel(e.target.value)}
                  maxLength={200}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/cases/${id}`)}
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
