import { z } from "zod";
import { MatterStatus, Priority, BillingType } from "@prisma/client";

export const createMatterSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters").max(200),
  description: z.string().max(2000).optional(),
  practiceAreaId: z.string().cuid().optional(),
  status: z.nativeEnum(MatterStatus).default(MatterStatus.INTAKE),
  priority: z.nativeEnum(Priority).default(Priority.MEDIUM),
  dueDate: z.string().datetime().optional().nullable(),
  statuteOfLimits: z.string().datetime().optional().nullable(),
  billingType: z.nativeEnum(BillingType).default(BillingType.HOURLY),
  hourlyRate: z.number().positive().optional().nullable(),
  flatFee: z.number().positive().optional().nullable(),
  retainerAmount: z.number().positive().optional().nullable(),
  courtName: z.string().max(200).optional(),
  caseNumber: z.string().max(100).optional(),
  judge: z.string().max(200).optional(),
  opposingCounsel: z.string().max(200).optional(),
  isConfidential: z.boolean().default(false),
  clientIds: z.array(z.string().cuid()).min(1, "At least one client required"),
  assigneeIds: z.array(z.string().cuid()).optional(),
});

export const updateMatterSchema = createMatterSchema.partial().omit({
  clientIds: true,
});

export type CreateMatterInput = z.infer<typeof createMatterSchema>;
export type UpdateMatterInput = z.infer<typeof updateMatterSchema>;
