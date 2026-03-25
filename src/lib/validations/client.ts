import { z } from "zod";

export const createClientSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  email: z.string().email("Invalid email address"),
  phone: z.string().max(20).optional(),
  clientType: z.enum(["INDIVIDUAL", "BUSINESS"]).default("INDIVIDUAL"),
  companyName: z.string().max(200).optional(),
  dateOfBirth: z.string().optional(), // will be encrypted
  ssnLastFour: z
    .string()
    .regex(/^\d{4}$/, "Must be exactly 4 digits")
    .optional(), // will be encrypted
  address: z.string().max(500).optional(), // will be encrypted
  city: z.string().max(100).optional(),
  state: z.string().max(50).optional(),
  zipCode: z.string().max(20).optional(),
  referralSource: z.string().max(200).optional(),
  notes: z.string().max(5000).optional(), // will be encrypted
  conflictChecked: z.boolean().default(false),
  conflictNotes: z.string().max(1000).optional(),
});

export const updateClientSchema = createClientSchema.partial();

export const intakeFormSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  practiceArea: z.string().min(1, "Please select a practice area"),
  matterDescription: z
    .string()
    .min(10, "Please describe your legal matter")
    .max(5000),
  preferredContact: z.enum(["email", "phone"]).default("email"),
  urgency: z.enum(["standard", "urgent"]).default("standard"),
  hasExistingAttorney: z.boolean().default(false),
  referralSource: z.string().optional(),
  additionalInfo: z.string().max(2000).optional(),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type IntakeFormInput = z.infer<typeof intakeFormSchema>;
