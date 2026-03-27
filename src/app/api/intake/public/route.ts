import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { intakeFormSchema } from "@/lib/validations/client";
import { encryptField } from "@/lib/encryption";
import { AuditAction } from "@prisma/client";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantSlug, ...formData } = body;

    if (!tenantSlug || typeof tenantSlug !== "string") {
      return NextResponse.json({ message: "Tenant slug is required" }, { status: 400 });
    }

    const parsed = intakeFormSchema.safeParse(formData);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", errors: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const tenant = await db.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true, isActive: true, encryptionKeyId: true },
    });

    if (!tenant || !tenant.isActive) {
      return NextResponse.json({ message: "Firm not found" }, { status: 404 });
    }

    const encFormData = encryptField(
      JSON.stringify(parsed.data),
      tenant.encryptionKeyId
    );

    const intakeForm = await db.intakeForm.create({
      data: {
        tenantId: tenant.id,
        practiceArea: parsed.data.practiceArea,
        encFormData,
        status: "SUBMITTED",
        submittedAt: new Date(),
      },
    });

    await writeAuditLog({
      tenantId: tenant.id,
      action: AuditAction.INTAKE_SUBMITTED,
      entityType: "IntakeForm",
      entityId: intakeForm.id,
      description: `Public intake submission for ${parsed.data.practiceArea}`,
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
    });

    return NextResponse.json({ id: intakeForm.id, success: true }, { status: 201 });
  } catch (err) {
    console.error("[PUBLIC INTAKE POST]", err);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
