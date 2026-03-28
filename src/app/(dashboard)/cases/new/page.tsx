"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

interface ClientOption {
  id: string;
  firstName: string;
  lastName: string;
}

interface AttorneyOption {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface PracticeAreaOption {
  id: string;
  name: string;
}

export default function NewCasePage() {
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(true);

  // Form fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("INTAKE");
  const [priority, setPriority] = useState("MEDIUM");
  const [billingType, setBillingType] = useState("HOURLY");
  const [hourlyRate, setHourlyRate] = useState("");
  const [flatFee, setFlatFee] = useState("");
  const [retainerAmount, setRetainerAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [statuteOfLimits, setStatuteOfLimits] = useState("");
  const [courtName, setCourtName] = useState("");
  const [caseNumber, setCaseNumber] = useState("");
  const [judge, setJudge] = useState("");
  const [opposingCounsel, setOpposingCounsel] = useState("");
  const [isConfidential, setIsConfidential] = useState(false);

  // Relationships
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedAttorneyId, setSelectedAttorneyId] = useState("");
  const [selectedPracticeAreaId, setSelectedPracticeAreaId] = useState("");

  // Options loaded from API
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [attorneys, setAttorneys] = useState<AttorneyOption[]>([]);
  const [practiceAreas, setPracticeAreas] = useState<PracticeAreaOption[]>([]);

  useEffect(() => {
    async function loadOptions() {
      try {
        const [clientsRes, usersRes, areasRes] = await Promise.all([
          fetch("/api/clients"),
          fetch("/api/users"),
          fetch("/api/practice-areas"),
        ]);

        if (clientsRes.ok) {
          const clientsData = await clientsRes.json();
          // The clients API may return an array or an object with a data property
          const clientsList = Array.isArray(clientsData)
            ? clientsData
            : clientsData.data || [];
          setClients(
            clientsList.map((c: ClientOption) => ({
              id: c.id,
              firstName: c.firstName,
              lastName: c.lastName,
            }))
          );
        }

        if (usersRes.ok) {
          const usersData = await usersRes.json();
          const usersList = Array.isArray(usersData)
            ? usersData
            : usersData.data || [];
          // Filter to attorneys and staff who can be assigned
          setAttorneys(
            usersList
              .filter(
                (u: AttorneyOption) =>
                  u.role === "ATTORNEY" ||
                  u.role === "FIRM_ADMIN" ||
                  u.role === "STAFF"
              )
              .map((u: AttorneyOption) => ({
                id: u.id,
                firstName: u.firstName,
                lastName: u.lastName,
                role: u.role,
              }))
          );
        }

        if (areasRes.ok) {
          const areasData = await areasRes.json();
          const areasList = Array.isArray(areasData)
            ? areasData
            : areasData.data || [];
          setPracticeAreas(
            areasList.map((a: PracticeAreaOption) => ({
              id: a.id,
              name: a.name,
            }))
          );
        }
      } catch {
        // Options failed to load — form can still be used with manual entry
        console.error("Failed to load form options");
      } finally {
        setLoadingOptions(false);
      }
    }

    loadOptions();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    if (!selectedClientId) {
      setError("Please select a client");
      setSaving(false);
      return;
    }

    const body: Record<string, unknown> = {
      title,
      description: description || undefined,
      status,
      priority,
      billingType,
      isConfidential,
      clientIds: [selectedClientId],
      courtName: courtName || undefined,
      caseNumber: caseNumber || undefined,
      judge: judge || undefined,
      opposingCounsel: opposingCounsel || undefined,
    };

    if (selectedAttorneyId) {
      body.assigneeIds = [selectedAttorneyId];
    }

    if (selectedPracticeAreaId) {
      body.practiceAreaId = selectedPracticeAreaId;
    }

    if (hourlyRate) body.hourlyRate = parseFloat(hourlyRate);
    if (flatFee) body.flatFee = parseFloat(flatFee);
    if (retainerAmount) body.retainerAmount = parseFloat(retainerAmount);
    if (dueDate) body.dueDate = new Date(dueDate).toISOString();
    if (statuteOfLimits)
      body.statuteOfLimits = new Date(statuteOfLimits).toISOString();

    try {
      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(
          data.error || data.message || "Failed to create case"
        );
      }

      const matter = await res.json();
      router.push(`/cases/${matter.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">New Case</h1>
        <Button variant="outline" onClick={() => router.push("/cases")}>
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
              <Label htmlFor="title">
                Title <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                minLength={2}
                maxLength={200}
                placeholder="e.g., Smith v. Jones - Personal Injury"
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
                placeholder="Brief description of the case..."
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
              <Label htmlFor="practiceArea">Practice Area</Label>
              {loadingOptions ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : practiceAreas.length > 0 ? (
                <Select
                  value={selectedPracticeAreaId}
                  onValueChange={setSelectedPracticeAreaId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select practice area" />
                  </SelectTrigger>
                  <SelectContent>
                    {practiceAreas.map((area) => (
                      <SelectItem key={area.id} value={area.id}>
                        {area.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No practice areas configured
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dueDate">Due Date</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="statuteOfLimits">Statute of Limitations</Label>
                <Input
                  id="statuteOfLimits"
                  type="date"
                  value={statuteOfLimits}
                  onChange={(e) => setStatuteOfLimits(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="isConfidential"
                type="checkbox"
                checked={isConfidential}
                onChange={(e) => setIsConfidential(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="isConfidential">
                Mark as confidential
              </Label>
            </div>
          </CardContent>
        </Card>

        {/* Client & Attorney Assignment */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Client & Attorney Assignment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="client">
                Client <span className="text-red-500">*</span>
              </Label>
              {loadingOptions ? (
                <p className="text-sm text-muted-foreground">
                  Loading clients...
                </p>
              ) : clients.length > 0 ? (
                <Select
                  value={selectedClientId}
                  onValueChange={setSelectedClientId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.firstName} {client.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No clients found.{" "}
                  <a href="/clients/new" className="underline text-primary">
                    Add a client first
                  </a>
                  .
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="attorney">Lead Attorney</Label>
              {loadingOptions ? (
                <p className="text-sm text-muted-foreground">
                  Loading attorneys...
                </p>
              ) : attorneys.length > 0 ? (
                <Select
                  value={selectedAttorneyId}
                  onValueChange={setSelectedAttorneyId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select lead attorney" />
                  </SelectTrigger>
                  <SelectContent>
                    {attorneys.map((attorney) => (
                      <SelectItem key={attorney.id} value={attorney.id}>
                        {attorney.firstName} {attorney.lastName}
                        <span className="ml-2 text-muted-foreground text-xs">
                          ({attorney.role === "ATTORNEY"
                            ? "Attorney"
                            : attorney.role === "FIRM_ADMIN"
                            ? "Admin"
                            : "Staff"}
                          )
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No attorneys found
                </p>
              )}
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

              <div className="space-y-2">
                <Label htmlFor="retainerAmount">Retainer ($)</Label>
                <Input
                  id="retainerAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={retainerAmount}
                  onChange={(e) => setRetainerAmount(e.target.value)}
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
            onClick={() => router.push("/cases")}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving || loadingOptions}>
            {saving ? "Creating..." : "Create Case"}
          </Button>
        </div>
      </form>
    </div>
  );
}
