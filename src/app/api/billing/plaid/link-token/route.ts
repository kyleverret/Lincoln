/**
 * Creates a Plaid Link token for the client to initiate bank connection.
 * The token is short-lived (30 min) and used by the Plaid Link component.
 *
 * Required env vars:
 *   PLAID_CLIENT_ID  — from Plaid dashboard
 *   PLAID_SECRET     — environment-specific secret (sandbox / development / production)
 *   PLAID_ENV        — "sandbox" | "development" | "production"
 */

import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PlaidApi, PlaidEnvironments, Configuration, Products, CountryCode } from "plaid";

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
    return Response.json({ error: "Plaid is not configured on this instance" }, { status: 501 });
  }

  try {
    const client = getPlaidClient();
    const { data } = await client.linkTokenCreate({
      user: { client_user_id: session.user.id },
      client_name: "Lincoln Case Management",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
    });
    return Response.json({ link_token: data.link_token });
  } catch (err: any) {
    console.error("[plaid] link-token error:", err?.response?.data ?? err);
    return Response.json({ error: "Failed to create Plaid link token" }, { status: 502 });
  }
}
