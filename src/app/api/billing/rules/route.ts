import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { z } from "zod";
import { AlertFloorType } from "@prisma/client";

const upsertSchema = z.object({
  matterId: z.string().min(1),
  floorType: z.nativeEnum(AlertFloorType).default(AlertFloorType.STATIC),
  floorAmount: z.number().min(0).optional(),
  floorPercent: z.number().min(0).max(1).optional(),
  notifyLeadOnly: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.user.role, "TRUST_READ")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const matterId = searchParams.get("matterId");

  const rules = await db.billingRule.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...(matterId ? { matterId } : {}),
    },
  });

  await writeAuditLog({
    userId: session.user.id,
    tenantId: session.user.tenantId,
    action: "BILLING_RULE_ACCESSED",
  });

  return Response.json(rules);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.user.role, "BILLING_RULE_MANAGE")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const { matterId, floorType, floorAmount, floorPercent, notifyLeadOnly, isActive } = parsed.data;

  // Validate matter belongs to tenant
  const matter = await db.matter.findFirst({
    where: { id: matterId, tenantId: session.user.tenantId },
  });
  if (!matter) return Response.json({ error: "Matter not found" }, { status: 404 });

  const rule = await db.billingRule.upsert({
    where: { matterId },
    create: {
      tenantId: session.user.tenantId,
      matterId,
      floorType,
      floorAmount: floorAmount ?? null,
      floorPercent: floorPercent ?? null,
      notifyLeadOnly,
      isActive,
    },
    update: {
      floorType,
      floorAmount: floorAmount ?? null,
      floorPercent: floorPercent ?? null,
      notifyLeadOnly,
      isActive,
    },
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    matterId,
    action: "BILLING_RULE_SET",
    entityType: "BillingRule",
    entityId: rule.id,
    description: `Retainer alert rule set for matter ${matter.matterNumber}`,
  });

  return Response.json(rule);
}
