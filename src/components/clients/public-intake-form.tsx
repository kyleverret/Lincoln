"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { intakeFormSchema, type IntakeFormInput } from "@/lib/validations/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, CheckCircle } from "lucide-react";

interface Props {
  tenantSlug: string;
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

export function PublicIntakeForm({ tenantSlug }: Props) {
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
      const res = await fetch("/api/intake/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, tenantSlug }),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.message ?? "Failed to submit form");
        return;
      }

      setSuccess(true);
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
          <h3 className="text-lg font-semibold">Thank You</h3>
          <p className="text-muted-foreground text-sm max-w-md">
            Your intake form has been submitted. Our team will review your
            information and contact you within 1-2 business days.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
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
              <Input id="firstName" {...register("firstName")} />
              {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Last Name *</Label>
              <Input id="lastName" {...register("lastName")} />
              {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email *</Label>
              <Input id="email" type="email" {...register("email")} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" {...register("phone")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Practice Area *</Label>
            <Select onValueChange={(v) => setValue("practiceArea", v)}>
              <SelectTrigger><SelectValue placeholder="Select practice area" /></SelectTrigger>
              <SelectContent>
                {PRACTICE_AREAS.map((area) => (
                  <SelectItem key={area} value={area}>{area}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.practiceArea && <p className="text-xs text-destructive">{errors.practiceArea.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="matterDescription">Describe Your Legal Matter *</Label>
            <Textarea id="matterDescription" {...register("matterDescription")} rows={5} />
            {errors.matterDescription && <p className="text-xs text-destructive">{errors.matterDescription.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Preferred Contact</Label>
              <Select defaultValue="email" onValueChange={(v) => setValue("preferredContact", v as "email" | "phone")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Urgency</Label>
              <Select defaultValue="standard" onValueChange={(v) => setValue("urgency", v as "standard" | "urgent")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="referralSource">How did you hear about us?</Label>
            <Input id="referralSource" {...register("referralSource")} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="additionalInfo">Additional Information</Label>
            <Textarea id="additionalInfo" {...register("additionalInfo")} rows={3} />
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Submitting..." : "Submit"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
