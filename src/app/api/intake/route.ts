import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { intakeFormSchema } from "@/lib/validations/client";
import { encryptField } from "@/lib/encryption";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { tenantId, id: userId } = session.user;

    const body = await req.json();
    const parsed = intakeFormSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", errors: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { encryptionKeyId: true },
    });

    if (!tenant) {
      return NextResponse.json({ message: "Tenant not found" }, { status: 404 });
    }

    // Encrypt the entire form data JSON (it contains PII)
    const encFormData = encryptField(
      JSON.stringify(data),
      tenant.encryptionKeyId
    );

    const intakeForm = await db.intakeForm.create({
      data: {
        tenantId,
        practiceArea: data.practiceArea,
        encFormData,
        status: "SUBMITTED",
        submittedAt: new Date(),
      },
    });

    await audit.intakeSubmitted(
      {
        tenantId,
        userId,
        ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      },
      intakeForm.id
    );

    return NextResponse.json({ id: intakeForm.id, success: true }, { status: 201 });
  } catch (err) {
    console.error("[INTAKE POST]", err);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
