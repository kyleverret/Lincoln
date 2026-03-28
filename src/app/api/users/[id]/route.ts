import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { UserRole } from "@prisma/client";
import { AuditAction } from "@prisma/client";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const updateUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  role: z.nativeEnum(UserRole).optional(),
  title: z.string().max(200).optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { tenantId, role } = session.user;
    const { id } = await params;

    if (!hasPermission(role, "USER_READ")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const tenantUser = await db.tenantUser.findFirst({
      where: { userId: id, tenantId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            isActive: true,
            mfaEnabled: true,
            lastLoginAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!tenantUser) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await writeAuditLog({
      action: AuditAction.USER_UPDATED,
      tenantId,
      userId: session.user.id,
      entityType: "User",
      entityId: id,
      description: `Read user profile: ${tenantUser.user.firstName} ${tenantUser.user.lastName}`,
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
    });

    return NextResponse.json({
      id: tenantUser.user.id,
      tenantUserId: tenantUser.id,
      firstName: tenantUser.user.firstName,
      lastName: tenantUser.user.lastName,
      email: tenantUser.user.email,
      phone: tenantUser.user.phone,
      role: tenantUser.role,
      title: tenantUser.title,
      department: tenantUser.department,
      isActive: tenantUser.isActive && tenantUser.user.isActive,
      mfaEnabled: tenantUser.user.mfaEnabled,
      lastLoginAt: tenantUser.user.lastLoginAt,
      createdAt: tenantUser.user.createdAt,
    });
  } catch (err) {
    console.error("[USER GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { tenantId, role } = session.user;
    const { id } = await params;

    if (!hasPermission(role, "USER_UPDATE_ANY")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Verify user belongs to this tenant
    const tenantUser = await db.tenantUser.findFirst({
      where: { userId: id, tenantId },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });

    if (!tenantUser) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Prevent non-super-admins from modifying super admin users
    if (tenantUser.role === UserRole.SUPER_ADMIN && role !== UserRole.SUPER_ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = updateUserSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { firstName, lastName, email, role: newRole, title, isActive } = parsed.data;

    // Prevent elevating to SUPER_ADMIN unless you are one
    if (newRole === UserRole.SUPER_ADMIN && role !== UserRole.SUPER_ADMIN) {
      return NextResponse.json(
        { error: "Cannot assign SUPER_ADMIN role" },
        { status: 403 }
      );
    }

    // Check email uniqueness if changing
    if (email) {
      const existing = await db.user.findFirst({
        where: { email, id: { not: id } },
      });
      if (existing) {
        return NextResponse.json(
          { error: "Email already in use" },
          { status: 409 }
        );
      }
    }

    // Update user record
    const userUpdate: Record<string, unknown> = {};
    if (firstName !== undefined) userUpdate.firstName = firstName;
    if (lastName !== undefined) userUpdate.lastName = lastName;
    if (email !== undefined) userUpdate.email = email;
    if (isActive !== undefined) userUpdate.isActive = isActive;

    if (Object.keys(userUpdate).length > 0) {
      await db.user.update({
        where: { id },
        data: userUpdate,
      });
    }

    // Update tenant-user record (role, title, isActive)
    const tenantUserUpdate: Record<string, unknown> = {};
    if (newRole !== undefined) tenantUserUpdate.role = newRole;
    if (title !== undefined) tenantUserUpdate.title = title;
    if (isActive !== undefined) tenantUserUpdate.isActive = isActive;

    if (Object.keys(tenantUserUpdate).length > 0) {
      await db.tenantUser.update({
        where: { id: tenantUser.id },
        data: tenantUserUpdate,
      });
    }

    await writeAuditLog({
      action: AuditAction.USER_UPDATED,
      tenantId,
      userId: session.user.id,
      entityType: "User",
      entityId: id,
      description: `Updated user ${tenantUser.user.firstName} ${tenantUser.user.lastName}: ${Object.keys(parsed.data).join(", ")}`,
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[USER PUT]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
