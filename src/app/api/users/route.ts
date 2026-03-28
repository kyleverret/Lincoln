import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { UserRole, AuditAction } from "@prisma/client";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const createUserSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum(["FIRM_ADMIN", "ATTORNEY", "STAFF"]),
  title: z.string().max(200).optional(),
  password: z.string().min(8).max(128).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(session.user.role, "USER_CREATE")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { firstName, lastName, email, role, title } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();

    // Check if email already exists
    const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return NextResponse.json(
        { error: "A user with this email already exists" },
        { status: 409 }
      );
    }

    // Generate a temporary password if none provided
    const tempPassword = parsed.data.password ?? crypto.randomBytes(16).toString("hex");
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const user = await db.user.create({
      data: {
        email: normalizedEmail,
        firstName,
        lastName,
        passwordHash,
        isActive: true,
        tenantUsers: {
          create: {
            tenantId: session.user.tenantId,
            role: role as UserRole,
            title: title ?? null,
            isActive: true,
          },
        },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });

    await writeAuditLog({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: AuditAction.USER_CREATED,
      entityType: "User",
      entityId: user.id,
      description: `Created user: ${firstName} ${lastName} (${normalizedEmail}) as ${role}`,
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
    });

    return NextResponse.json(
      {
        ...user,
        tempPassword: parsed.data.password ? undefined : tempPassword,
        message: parsed.data.password
          ? "User created successfully"
          : "User created with temporary password. Share it securely with the user.",
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[USER CREATE]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
