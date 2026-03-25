import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { storeDocument } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { hasPermission } from "@/lib/permissions";
import { DocumentCategory } from "@prisma/client";

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE ?? "52428800", 10);
const ALLOWED_TYPES = (
  process.env.ALLOWED_FILE_TYPES ??
  "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,text/plain"
).split(",");

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { tenantId, role, id: userId } = session.user;

    if (!hasPermission(role, "DOCUMENT_UPLOAD")) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { message: "No file provided" },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { message: "File too large" },
        { status: 400 }
      );
    }

    // Validate MIME type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { message: "File type not allowed" },
        { status: 400 }
      );
    }

    const displayName = (formData.get("displayName") as string) || file.name;
    const description = (formData.get("description") as string) || "";
    const category = (formData.get("category") as DocumentCategory) || "OTHER";
    const matterId = (formData.get("matterId") as string) || null;
    const clientId = (formData.get("clientId") as string) || null;
    const isConfidential = formData.get("isConfidential") === "true";
    const allowClientView = formData.get("allowClientView") === "true";

    // Validate matter belongs to tenant
    if (matterId) {
      const matter = await db.matter.findFirst({
        where: { id: matterId, tenantId },
      });
      if (!matter) {
        return NextResponse.json(
          { message: "Matter not found" },
          { status: 404 }
        );
      }
    }

    // Get tenant encryption key
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { encryptionKeyId: true },
    });

    if (!tenant) {
      return NextResponse.json(
        { message: "Tenant not found" },
        { status: 404 }
      );
    }

    // Read file bytes
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Create document record to get ID for storage path
    const document = await db.document.create({
      data: {
        tenantId,
        matterId: matterId || undefined,
        clientId: clientId || undefined,
        uploadedById: userId,
        fileName: file.name,
        displayName,
        mimeType: file.type,
        sizeBytes: BigInt(file.size),
        category,
        description,
        isConfidential,
        allowClientView,
        encryptionKeyId: tenant.encryptionKeyId,
        // Placeholder — will be updated after storage
        storagePath: "pending",
        iv: "pending",
        checksum: "pending",
      },
    });

    // Store encrypted document
    const storageResult = await storeDocument(
      tenantId,
      document.id,
      buffer,
      tenant.encryptionKeyId
    );

    // Update with actual storage metadata
    // iv field stores "<iv_hex>:<authTag_hex>" for AES-GCM integrity
    await db.document.update({
      where: { id: document.id },
      data: {
        storagePath: storageResult.storagePath,
        iv: `${storageResult.iv}:${storageResult.authTag}`,
        checksum: storageResult.checksum,
      },
    });

    // Audit log
    await audit.documentUploaded(
      {
        tenantId,
        userId,
        matterId: matterId ?? undefined,
        clientId: clientId ?? undefined,
        documentId: document.id,
        ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      },
      document.id,
      file.name
    );

    return NextResponse.json({ id: document.id, success: true });
  } catch (err) {
    console.error("[DOCUMENT UPLOAD]", err);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
