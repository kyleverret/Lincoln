"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, CheckCircle, XCircle, Clock, FileText } from "lucide-react";

interface Intake {
  id: string;
  status: string;
  practiceArea: string | null;
  submittedAt: string | Date | null;
  reviewedAt: string | Date | null;
  createdAt: string | Date;
}

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  practiceArea: string;
  matterDescription: string;
  preferredContact: string;
  urgency: string;
  referralSource?: string;
  additionalInfo?: string;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  SUBMITTED: { label: "Pending Review", className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  UNDER_REVIEW: { label: "Under Review", className: "bg-blue-100 text-blue-800 border-blue-200" },
  ACCEPTED: { label: "Accepted", className: "bg-green-100 text-green-800 border-green-200" },
  REJECTED: { label: "Rejected", className: "bg-red-100 text-red-800 border-red-200" },
  DRAFT: { label: "Draft", className: "bg-gray-100 text-gray-800 border-gray-200" },
};

export function IntakeReviewClient({ intakes: initialIntakes }: { intakes: Intake[] }) {
  const [intakes, setIntakes] = useState(initialIntakes);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ formData: FormData; status: string; notes: string | null } | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadDetail(id: string) {
    setSelected(id);
    setLoading(true);
    try {
      const res = await fetch(`/api/intake/${id}`);
      if (res.ok) {
        const data = await res.json();
        setDetail(data);
        setNotes(data.notes || "");
      }
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(status: "UNDER_REVIEW" | "ACCEPTED" | "REJECTED") {
    if (!selected) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/intake/${selected}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes: notes || undefined }),
      });
      if (res.ok) {
        setIntakes((prev) =>
          prev.map((i) => (i.id === selected ? { ...i, status } : i))
        );
        if (detail) setDetail({ ...detail, status });
      }
    } finally {
      setLoading(false);
    }
  }

  if (selected && detail) {
    const fd = detail.formData;
    return (
      <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto space-y-4">
        <Button variant="ghost" size="sm" onClick={() => { setSelected(null); setDetail(null); }}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to list
        </Button>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Intake: {fd.firstName} {fd.lastName}</CardTitle>
            <Badge variant="outline" className={STATUS_BADGE[detail.status]?.className}>
              {STATUS_BADGE[detail.status]?.label}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="font-medium">Email:</span> {fd.email}</div>
              <div><span className="font-medium">Phone:</span> {fd.phone || "—"}</div>
              <div><span className="font-medium">Practice Area:</span> {fd.practiceArea}</div>
              <div><span className="font-medium">Urgency:</span> {fd.urgency}</div>
              <div><span className="font-medium">Preferred Contact:</span> {fd.preferredContact}</div>
              <div><span className="font-medium">Referral:</span> {fd.referralSource || "—"}</div>
            </div>

            <div>
              <p className="text-sm font-medium mb-1">Matter Description</p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{fd.matterDescription}</p>
            </div>

            {fd.additionalInfo && (
              <div>
                <p className="text-sm font-medium mb-1">Additional Info</p>
                <p className="text-sm text-muted-foreground">{fd.additionalInfo}</p>
              </div>
            )}

            <div>
              <p className="text-sm font-medium mb-1">Review Notes</p>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Add notes about this intake..."
              />
            </div>

            <div className="flex gap-2">
              {detail.status === "SUBMITTED" && (
                <Button size="sm" variant="outline" onClick={() => updateStatus("UNDER_REVIEW")} disabled={loading}>
                  <Clock className="h-4 w-4 mr-1" /> Mark Under Review
                </Button>
              )}
              {detail.status !== "ACCEPTED" && (
                <Button size="sm" onClick={() => updateStatus("ACCEPTED")} disabled={loading}>
                  <CheckCircle className="h-4 w-4 mr-1" /> Accept
                </Button>
              )}
              {detail.status !== "REJECTED" && (
                <Button size="sm" variant="destructive" onClick={() => updateStatus("REJECTED")} disabled={loading}>
                  <XCircle className="h-4 w-4 mr-1" /> Reject
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {intakes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FileText className="h-10 w-10 text-muted-foreground mb-3" />
          <h3 className="text-lg font-medium">No intake submissions</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Intake forms submitted by potential clients will appear here.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-background divide-y">
          {intakes.map((intake) => {
            const badge = STATUS_BADGE[intake.status] ?? STATUS_BADGE.DRAFT;
            return (
              <button
                key={intake.id}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                onClick={() => loadDetail(intake.id)}
              >
                <div>
                  <span className="text-sm font-medium">{intake.practiceArea || "General"}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Submitted {intake.submittedAt
                      ? new Date(intake.submittedAt).toLocaleDateString()
                      : new Date(intake.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Badge variant="outline" className={badge.className}>
                  {badge.label}
                </Badge>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
