/**
 * CSV import endpoint for trust account transactions.
 *
 * Expected CSV columns (header row required, case-insensitive):
 *   date, description, amount, type, matter_number, reference
 *
 * - date: ISO 8601 or MM/DD/YYYY
 * - amount: positive number (direction determined by "type" column)
 * - type: deposit | withdrawal | adjustment (defaults to "deposit" if omitted)
 * - matter_number: matches Matter.matterNumber in this tenant
 * - reference: optional check/wire reference number
 */

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { checkRetainerAlert } from "@/lib/trust/notifications";
import { TrustTransactionType, TrustTransactionStatus } from "@prisma/client";

const TYPE_MAP: Record<string, TrustTransactionType> = {
  deposit: TrustTransactionType.DEPOSIT,
  withdrawal: TrustTransactionType.WITHDRAWAL,
  transfer_out: TrustTransactionType.TRANSFER_OUT,
  transfer_in: TrustTransactionType.TRANSFER_IN,
  adjustment: TrustTransactionType.ADJUSTMENT,
};

function parseDate(raw: string): Date | null {
  if (!raw) return null;
  // Try ISO first, then MM/DD/YYYY
  const iso = new Date(raw);
  if (!isNaN(iso.getTime())) return iso;
  const [m, d, y] = raw.split("/");
  const fallback = new Date(`${y}-${m?.padStart(2, "0")}-${d?.padStart(2, "0")}`);
  return isNaN(fallback.getTime()) ? null : fallback;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.user.role, "BANK_ACCOUNT_MANAGE")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: bankAccountId } = await params;
  const account = await db.bankAccount.findFirst({
    where: { id: bankAccountId, tenantId: session.user.tenantId ?? undefined },
  });
  if (!account) return Response.json({ error: "Not found" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return Response.json({ error: "CSV must have at least a header and one data row" }, { status: 400 });

  // Parse header
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const idx = (col: string) => headers.indexOf(col);

  const errors: string[] = [];
  const toCreate: {
    tenantId: string; matterId: string; bankAccountId: string;
    type: import("@prisma/client").TrustTransactionType;
    amount: number; description: string; date: Date;
    referenceNumber: string | null; status: import("@prisma/client").TrustTransactionStatus;
    requestedById: string; importBatchId: string; isReconciled: boolean;
  }[] = [];
  const importBatchId = `import-${Date.now()}`;

  // Pre-fetch all matters for this tenant for number lookup
  const matters = await db.matter.findMany({
    where: { tenantId: session.user.tenantId ?? undefined },
    select: { id: true, matterNumber: true },
  });
  const matterByNumber = new Map(matters.map((m) => [m.matterNumber, m.id]));

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const row = (col: string) => cols[idx(col)] ?? "";

    const date = parseDate(row("date"));
    if (!date) { errors.push(`Row ${i + 1}: invalid date "${row("date")}"`); continue; }

    const amount = parseFloat(row("amount"));
    if (isNaN(amount) || amount <= 0) { errors.push(`Row ${i + 1}: invalid amount "${row("amount")}"`); continue; }

    const rawType = row("type").toLowerCase() || "deposit";
    const type = TYPE_MAP[rawType];
    if (!type) { errors.push(`Row ${i + 1}: unknown type "${rawType}"`); continue; }

    const matterNumber = row("matter_number");
    const matterId = matterByNumber.get(matterNumber);
    if (!matterId) { errors.push(`Row ${i + 1}: matter "${matterNumber}" not found`); continue; }

    toCreate.push({
      tenantId: session.user.tenantId!,
      matterId,
      bankAccountId,
      type,
      amount,
      description: row("description") || `Imported: ${rawType}`,
      date,
      referenceNumber: row("reference") || null,
      status: TrustTransactionStatus.CLEARED,
      requestedById: session.user.id,
      importBatchId,
      isReconciled: false,
    });
  }

  if (toCreate.length === 0) {
    return Response.json({ error: "No valid rows to import", errors }, { status: 400 });
  }

  await db.trustTransaction.createMany({ data: toCreate });

  // Run retainer alerts for each affected matter
  const affectedMatters = [...new Set(toCreate.map((r) => r.matterId))];
  for (const matterId of affectedMatters) {
    await checkRetainerAlert(session.user.tenantId!, matterId, bankAccountId).catch(() => {});
  }

  await writeAuditLog({
    tenantId: session.user.tenantId ?? undefined,
    userId: session.user.id,
    action: "TRUST_DEPOSIT",
    entityType: "BankAccount",
    entityId: bankAccountId,
    description: `CSV import: ${toCreate.length} transactions imported (batch ${importBatchId})`,
  });

  return Response.json({ imported: toCreate.length, errors, batchId: importBatchId });
}
