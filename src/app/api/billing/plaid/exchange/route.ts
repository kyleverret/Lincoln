/**
 * Exchanges a Plaid public token for an access token and attaches it to a BankAccount.
 * The access token is encrypted with the tenant's derived key before storage.
 */

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { encryptField } from "@/lib/encryption";
import { PlaidApi, PlaidEnvironments, Configuration } from "plaid";
import { z } from "zod";

const schema = z.object({
  publicToken: z.string().min(1),
  bankAccountId: z.string().min(1),
  plaidAccountId: z.string().min(1),
});

function getPlaidClient() {
  const env = process.env.PLAID_ENV ?? "sandbox";
  const config = new Configuration({
    basePath: PlaidEnvironments[env as keyof typeof PlaidEnvironments] ?? PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
        "PLAID-SECRET": process.env.PLAID_SECRET,
      },
    },
  });
  return new PlaidApi(config);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.user.role, "BANK_ACCOUNT_MANAGE")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
    return Response.json({ error: "Plaid is not configured" }, { status: 501 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Validation failed" }, { status: 400 });
  }

  const { publicToken, bankAccountId, plaidAccountId } = parsed.data;

  const account = await db.bankAccount.findFirst({
    where: { id: bankAccountId, tenantId: session.user.tenantId ?? undefined },
  });
  if (!account) return Response.json({ error: "Bank account not found" }, { status: 404 });

  // Fetch tenant encryption key ID for encrypting the access token
  const tenant = await db.tenant.findUnique({
    where: { id: session.user.tenantId! },
    select: { encryptionKeyId: true },
  });
  if (!tenant) return Response.json({ error: "Tenant not found" }, { status: 404 });

  try {
    const client = getPlaidClient();
    const { data } = await client.itemPublicTokenExchange({ public_token: publicToken });

    // Encrypt the access token before storing
    const encPlaidAccessToken = encryptField(data.access_token, tenant.encryptionKeyId);

    await db.bankAccount.update({
      where: { id: bankAccountId },
      data: {
        plaidItemId: data.item_id,
        plaidAccountId,
        encPlaidAccessToken,
        plaidLastSyncedAt: new Date(),
      },
    });

    await audit.writeAuditLog({
      tenantId: session.user.tenantId ?? undefined,
      userId: session.user.id,
      action: "PLAID_CONNECTED",
      entityType: "BankAccount",
      entityId: bankAccountId,
      description: `Plaid connected to account: ${account.name}`,
    });

    return Response.json({ success: true });
  } catch (err: any) {
    console.error("[plaid] exchange error:", err?.response?.data ?? err);
    return Response.json({ error: "Failed to exchange Plaid token" }, { status: 502 });
  }
}
