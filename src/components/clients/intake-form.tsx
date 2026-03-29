"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { intakeFormSchema, type IntakeFormInput } from "@/lib/validations/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, CheckCircle } from "lucide-react";

interface IntakeFormProps {
  tenantId: string;
}

const PRACTICE_AREAS = [
  "Criminal Defense",
  "Family Law",
  "Personal Injury",
  "Business / Corporate",
  "Real Estate",
  "Immigration",
  "Estate Planning",
  "Employment",
  "Bankruptcy",
  "Civil Litigation",
  "Other",
];

export function IntakeForm({ tenantId: _tenantId }: IntakeFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<IntakeFormInput>({
    resolver: zodResolver(intakeFormSchema),
    defaultValues: {
      preferredContact: "email",
      urgency: "standard",
      hasExistingAttorney: false,
    },
  });

  const onSubmit = async (data: IntakeFormInput) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.message ?? "Failed to submit intake form");
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push("/clients"), 2000);
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <Card>
        <CardContent className="pt-6 flex flex-col items-center gap-3 text-center py-12">
          <CheckCircle className="h-12 w-12 text-green-500" />
          <h3 className="text-lg font-semibold">Intake Submitted</h3>
          <p className="text-muted-foreground text-sm">
            The intake form has been submitted successfully. Redirecting...
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Client Intake</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">First Name *</Label>
              <Input
                id="firstName"
                {...register("firstName")}
                placeholder="Jane"
              />
              {errors.firstName && (
                <p className="text-xs text-destructive">
                  {errors.firstName.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Last Name *</Label>
              <Input
                id="lastName"
                {...register("lastName")}
                placeholder="Smith"
              />
              {errors.lastName && (
                <p className="text-xs text-destructive">
                  {errors.lastName.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                {...register("email")}
                placeholder="jane@example.com"
              />
              {errors.email && (
                <p className="text-xs text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                {...register("phone")}
                placeholder="(555) 555-5555"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Practice Area *</Label>
            <Select onValueChange={(v) => setValue("practiceArea", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select practice area" />
              </SelectTrigger>
              <SelectContent>
                {PRACTICE_AREAS.map((area) => (
                  <SelectItem key={area} value={area}>
                    {area}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.practiceArea && (
              <p className="text-xs text-destructive">
                {errors.practiceArea.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="matterDescription">
              Describe Your Legal Matter *
            </Label>
            <Textarea
              id="matterDescription"
              {...register("matterDescription")}
              placeholder="Please describe the legal issue you need assistance with..."
              rows={5}
            />
            {errors.matterDescription && (
              <p className="text-xs text-destructive">
                {errors.matterDescription.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Preferred Contact</Label>
              <Select
                defaultValue="email"
                onValueChange={(v) =>
                  setValue("preferredContact", v as "email" | "phone")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Urgency</Label>
              <Select
                defaultValue="standard"
                onValueChange={(v) =>
                  setValue("urgency", v as "standard" | "urgent")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="referralSource">How did you hear about us?</Label>
            <Input
              id="referralSource"
              {...register("referralSource")}
              placeholder="Referral, Google, etc."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="additionalInfo">Additional Information</Label>
            <Textarea
              id="additionalInfo"
              {...register("additionalInfo")}
              placeholder="Any additional details..."
              rows={3}
            />
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Submitting..." : "Submit Intake Form"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
