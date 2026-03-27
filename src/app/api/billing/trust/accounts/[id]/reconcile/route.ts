import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { sendNotification } from "@/lib/trust/notifications";
import { isAccountStale } from "@/lib/trust/balance";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.user.role, "BANK_ACCOUNT_MANAGE")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const account = await db.bankAccount.findFirst({
    where: { id, tenantId: session.user.tenantId ?? undefined },
  });
  if (!account) return Response.json({ error: "Not found" }, { status: 404 });

  const updated = await db.bankAccount.update({
    where: { id },
    data: { lastReconciledAt: new Date() },
  });

  await writeAuditLog({
    tenantId: session.user.tenantId ?? undefined,
    userId: session.user.id,
    action: "TRUST_RECONCILED",
    entityType: "BankAccount",
    entityId: id,
    description: `Account reconciled: ${account.name}`,
  });

  return Response.json(updated);
}
