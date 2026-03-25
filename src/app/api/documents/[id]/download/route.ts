import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { retrieveDocument } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { UserRole } from "@prisma/client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { tenantId, role, id: userId } = session.user;

    const document = await db.document.findUnique({
      where: { id, isActive: true },
      include: {
        matter: {
          include: {
            assignments: { select: { userId: true } },
          },
        },
        tenant: { select: { encryptionKeyId: true } },
      },
    });

    if (!document) {
      return NextResponse.json(
        { message: "Document not found" },
        { status: 404 }
      );
    }

    // Tenant isolation
    if (tenantId && document.tenantId !== tenantId) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    // For CLIENT role: only documents explicitly allowed for client view
    if (role === UserRole.CLIENT) {
      if (!document.allowClientView) {
        return NextResponse.json({ message: "Forbidden" }, { status: 403 });
      }
      // Verify the client owns this document
      const client = await db.client.findFirst({
        where: { portalUserId: userId, tenantId: document.tenantId },
      });
      if (!client || document.clientId !== client.id) {
        return NextResponse.json({ message: "Forbidden" }, { status: 403 });
      }
    } else if (
      role !== UserRole.SUPER_ADMIN &&
      role !== UserRole.FIRM_ADMIN
    ) {
      // ATTORNEY / STAFF: must be assigned to the matter
      const isAssigned =
        document.matter?.assignments.some((a) => a.userId === userId) ||
        document.uploadedById === userId;

      if (!isAssigned) {
        return NextResponse.json({ message: "Forbidden" }, { status: 403 });
      }
    }

    // IV field stores "<iv_hex>:<authTag_hex>" for AES-GCM
    const [iv, authTag] = document.iv.split(":");

    // Retrieve and decrypt document
    const decrypted = await retrieveDocument(
      document.storagePath,
      iv,
      authTag ?? "",
      document.encryptionKeyId
    );

    // Audit log
    await audit.documentDownloaded(
      {
        tenantId: document.tenantId,
        userId,
        documentId: document.id,
        ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      },
      document.id,
      document.fileName
    );

    return new NextResponse(decrypted, {
      headers: {
        "Content-Type": document.mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(document.fileName)}"`,
        "Content-Length": decrypted.length.toString(),
        // Prevent caching of sensitive documents
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        Pragma: "no-cache",
      },
    });
  } catch (err) {
    console.error("[DOCUMENT DOWNLOAD]", err);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
