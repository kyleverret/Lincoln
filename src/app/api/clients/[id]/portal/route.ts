/**
 * POST /api/clients/[id]/portal
 *
 * Enable or reset portal access for a client. Creates a User account
 * (role: CLIENT via TenantUser) with a TenantUser record, links it to
 * the Client via portalUserId, and returns a one-time temporary password.
 *
 * Permission required: CLIENT_ENABLE_PORTAL
 */

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { NextResponse } from "next/server";
import { AuditAction, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%";
  const all = upper + lower + digits + special;
  const rand = randomBytes(12);
  let pw = "";
  pw += upper[rand[0] % upper.length];
  pw += lower[rand[1] % lower.length];
  pw += digits[rand[2] % digits.length];
  pw += special[rand[3] % special.length];
  for (let i = 4; i < 12; i++) {
    pw += all[rand[i] % all.length];
  }
  // Shuffle by sorting with random comparator
  return pw
    .split("")
    .sort(() => (randomBytes(1)[0] % 2 === 0 ? 1 : -1))
    .join("");
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { tenantId, role, id: actorId } = session.user;

  if (!hasPermission(role, "CLIENT_ENABLE_PORTAL")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: clientId } = await params;

  // Fetch client — must belong to same tenant
  const client = await db.client.findFirst({
    where: { id: clientId, tenantId },
  });

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { isActive: true },
  });
  if (!tenant?.isActive) {
    return NextResponse.json({ error: "Tenant is not active" }, { status: 400 });
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  let portalUserId: string;

  if (client.portalUserId) {
    // Reset existing portal user's password
    await db.user.update({
      where: { id: client.portalUserId },
      data: { passwordHash, isActive: true },
    });
    portalUserId = client.portalUserId;
  } else {
    // Check if a User already exists with this email (e.g., from a previous partial activation)
    const existingUser = await db.user.findUnique({
      where: { email: client.email },
    });

    if (existingUser) {
      // Update and reuse existing user
      await db.user.update({
        where: { id: existingUser.id },
        data: { passwordHash, isActive: true },
      });
      // Ensure TenantUser record exists
      await db.tenantUser.upsert({
        where: { tenantId_userId: { tenantId, userId: existingUser.id } },
        update: { role: UserRole.CLIENT, isActive: true },
        create: { tenantId, userId: existingUser.id, role: UserRole.CLIENT },
      });
      portalUserId = existingUser.id;
    } else {
      // Create new portal user
      const newUser = await db.user.create({
        data: {
          email: client.email,
          firstName: client.firstName,
          lastName: client.lastName,
          passwordHash,
          isActive: true,
        },
      });
      await db.tenantUser.create({
        data: {
          tenantId,
          userId: newUser.id,
          role: UserRole.CLIENT,
        },
      });
      portalUserId = newUser.id;
    }
  }

  // Link portal user to client and enable portal
  await db.client.update({
    where: { id: clientId },
    data: {
      portalUserId,
      portalEnabled: true,
    },
  });

  await writeAuditLog({
    tenantId,
    userId: actorId,
    clientId,
    action: AuditAction.USER_CREATED,
    entityType: "Client",
    entityId: clientId,
    description: `Portal ${client.portalUserId ? "password reset" : "activated"} for client ${client.firstName} ${client.lastName}`,
    ipAddress: _req.headers.get("x-forwarded-for") ?? undefined,
  });

  return NextResponse.json({
    portalEmail: client.email,
    temporaryPassword: tempPassword,
    message: client.portalUserId
      ? "Portal password has been reset."
      : "Portal access enabled. Share the temporary password securely with the client.",
  });
}
