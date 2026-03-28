import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { decryptField } from "@/lib/encryption";
import { AuditAction, IntakeStatus } from "@prisma/client";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  status: z.enum(["UNDER_REVIEW", "ACCEPTED", "REJECTED"]),
  notes: z.string().max(2000).optional(),
});

export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.user.role, "CLIENT_CREATE")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const intake = await db.intakeForm.findFirst({
    where: { id, tenantId: session.user.tenantId },
  });

  if (!intake) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const tenant = await db.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: { encryptionKeyId: true },
  });

  const formData = tenant
    ? JSON.parse(decryptField(intake.encFormData, tenant.encryptionKeyId))
    : null;

  return NextResponse.json({
    id: intake.id,
    status: intake.status,
    practiceArea: intake.practiceArea,
    notes: intake.notes,
    submittedAt: intake.submittedAt,
    reviewedAt: intake.reviewedAt,
    formData,
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.user.role, "CLIENT_CREATE")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const intake = await db.intakeForm.findFirst({
    where: { id, tenantId: session.user.tenantId },
  });

  if (!intake) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await db.intakeForm.update({
    where: { id },
    data: {
      status: parsed.data.status as IntakeStatus,
      notes: parsed.data.notes,
      reviewedBy: session.user.id,
      reviewedAt: new Date(),
    },
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: AuditAction.INTAKE_SUBMITTED,
    entityType: "IntakeForm",
    entityId: id,
    description: `Intake ${id} ${parsed.data.status.toLowerCase()}`,
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
  });

  return NextResponse.json({ id: updated.id, status: updated.status });
}
