import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { hasPermission } from "@/lib/permissions";
import { createClientSchema } from "@/lib/validations/client";
import { encryptField } from "@/lib/encryption";
import { UserRole } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { tenantId, role, id: userId } = session.user;
    const canSeeAll =
      role === UserRole.SUPER_ADMIN || role === UserRole.FIRM_ADMIN;

    const clients = await db.client.findMany({
      where: canSeeAll
        ? { tenantId, isActive: true }
        : {
            tenantId,
            isActive: true,
            matters: {
              some: {
                matter: { assignments: { some: { userId } } },
              },
            },
          },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        clientType: true,
        companyName: true,
        city: true,
        state: true,
        portalEnabled: true,
        conflictChecked: true,
        createdAt: true,
        _count: { select: { matters: true } },
      },
    });

    // HIPAA: audit log client list access (PHI)
    await audit.clientAccessed(
      {
        tenantId,
        userId,
        ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      },
      "LIST"
    );

    return NextResponse.json(clients);
  } catch (err) {
    console.error("[CLIENTS GET]", err);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { tenantId, role, id: userId } = session.user;

    if (!hasPermission(role, "CLIENT_CREATE")) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = createClientSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", errors: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Get tenant encryption key for sensitive fields
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { encryptionKeyId: true },
    });

    if (!tenant) {
      return NextResponse.json({ message: "Tenant not found" }, { status: 404 });
    }

    const client = await db.client.create({
      data: {
        tenantId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email.toLowerCase(),
        phone: data.phone,
        clientType: data.clientType,
        companyName: data.companyName,
        city: data.city,
        state: data.state,
        zipCode: data.zipCode,
        referralSource: data.referralSource,
        conflictChecked: data.conflictChecked ?? false,
        conflictNotes: data.conflictNotes,
        // Encrypt sensitive fields
        encDateOfBirth: data.dateOfBirth
          ? encryptField(data.dateOfBirth, tenant.encryptionKeyId)
          : undefined,
        encSsnLastFour: data.ssnLastFour
          ? encryptField(data.ssnLastFour, tenant.encryptionKeyId)
          : undefined,
        encAddress: data.address
          ? encryptField(data.address, tenant.encryptionKeyId)
          : undefined,
        encNotes: data.notes
          ? encryptField(data.notes, tenant.encryptionKeyId)
          : undefined,
      },
    });

    await audit.clientCreated(
      {
        tenantId,
        userId,
        clientId: client.id,
        ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      },
      client.id,
      `${client.firstName} ${client.lastName}`
    );

    return NextResponse.json(client, { status: 201 });
  } catch (err) {
    console.error("[CLIENT POST]", err);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
