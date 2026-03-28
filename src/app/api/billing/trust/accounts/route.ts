import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { z } from "zod";
import { BankAccountType } from "@prisma/client";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  bankName: z.string().max(200).optional().or(z.literal("")),
  accountType: z.nativeEnum(BankAccountType).default(BankAccountType.IOLTA),
  lastFourDigits: z.string().length(4).regex(/^\d{4}$/).optional().or(z.literal("")),
  staleThresholdDays: z.number().int().min(1).max(365).default(7),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.user.role, "TRUST_READ")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const accounts = await db.bankAccount.findMany({
    where: { tenantId: session.user.tenantId, isActive: true },
    orderBy: [{ accountType: "asc" }, { name: "asc" }],
  });

  return Response.json(accounts);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.user.role, "BANK_ACCOUNT_MANAGE")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const { bankName, lastFourDigits, ...rest } = parsed.data;
  const account = await db.bankAccount.create({
    data: {
      ...rest,
      bankName: bankName || null,
      lastFourDigits: lastFourDigits || null,
      tenantId: session.user.tenantId,
    },
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "BANK_ACCOUNT_CREATED",
    entityType: "BankAccount",
    entityId: account.id,
    description: `Bank account created: ${account.name}`,
  });

  return Response.json(account, { status: 201 });
}
