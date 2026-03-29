/**
 * PATCH /api/settings/profile — Update own user profile
 *
 * Allows any authenticated user to update their own name, phone,
 * and password. Does NOT allow changing email or role (admin-only).
 */

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { AuditAction } from "@prisma/client";
import { z } from "zod";
import bcrypt from "bcryptjs";

const profileUpdateSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(50).optional(),
  lastName: z.string().min(1, "Last name is required").max(50).optional(),
  phone: z.string().max(20).optional().nullable(),
});

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[a-z]/, "Must contain a lowercase letter")
    .regex(/[0-9]/, "Must contain a number")
    .regex(/[^A-Za-z0-9]/, "Must contain a special character"),
});

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { type } = body;

    if (type === "password") {
      return handlePasswordChange(session.user.id, session.user.tenantId, body);
    }

    return handleProfileUpdate(session.user.id, session.user.tenantId, body);
  } catch (error) {
    console.error("[PROFILE PATCH]", error);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function handleProfileUpdate(
  userId: string,
  tenantId: string | null,
  body: unknown
) {
  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.firstName !== undefined) data.firstName = parsed.data.firstName;
  if (parsed.data.lastName !== undefined) data.lastName = parsed.data.lastName;
  if (parsed.data.phone !== undefined) data.phone = parsed.data.phone;

  if (Object.keys(data).length === 0) {
    return Response.json({ error: "No fields to update" }, { status: 400 });
  }

  const updated = await db.user.update({
    where: { id: userId },
    data,
    select: { firstName: true, lastName: true, phone: true },
  });

  await writeAuditLog({
    userId,
    tenantId: tenantId ?? undefined,
    action: AuditAction.USER_UPDATED,
    entityType: "User",
    entityId: userId,
    description: `Updated profile: ${Object.keys(data).join(", ")}`,
  });

  return Response.json(updated);
}

async function handlePasswordChange(
  userId: string,
  tenantId: string | null,
  body: unknown
) {
  const parsed = passwordChangeSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, passwordHistory: true },
  });

  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  // Verify current password
  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) {
    return Response.json(
      { error: "Current password is incorrect" },
      { status: 403 }
    );
  }

  // Use password policy module if available
  try {
    const { validatePasswordChange, rotatePassword } = await import("@/lib/security/password-policy");

    const policyResult = await validatePasswordChange(userId, parsed.data.newPassword);
    if (!policyResult.valid) {
      return Response.json(
        { error: "Password policy violation", details: policyResult.errors },
        { status: 400 }
      );
    }

    await rotatePassword(userId, parsed.data.newPassword);
  } catch {
    // Fallback if security module not fully available
    const newHash = await bcrypt.hash(parsed.data.newPassword, 12);
    await db.user.update({
      where: { id: userId },
      data: {
        passwordHash: newHash,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
      },
    });
  }

  await writeAuditLog({
    userId,
    tenantId: tenantId ?? undefined,
    action: AuditAction.PASSWORD_CHANGED,
    entityType: "User",
    entityId: userId,
    description: "Password changed by user",
  });

  return Response.json({ success: true });
}
