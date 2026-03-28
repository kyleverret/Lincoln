import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { DocumentUploadForm } from "@/components/documents/upload-form";
import { hasPermission } from "@/lib/permissions";
import { notFound } from "next/navigation";

export const metadata = { title: "Upload Document" };

interface PageProps {
  searchParams: Promise<{ matterId?: string; clientId?: string }>;
}

export default async function UploadPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const { tenantId, role } = session.user;

  if (!hasPermission(role, "DOCUMENT_UPLOAD")) notFound();

  const params = await searchParams;

  const [matters, clients] = await Promise.all([
    db.matter.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, title: true, matterNumber: true },
      orderBy: { updatedAt: "desc" },
    }),
    db.client.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { lastName: "asc" },
    }),
  ]);

  return (
    <div>
      <Header title="Upload Document" role={role} />
      <div className="p-4 sm:p-6 max-w-2xl">
        <DocumentUploadForm
          matters={matters}
          clients={clients}
          defaultMatterId={params.matterId}
          defaultClientId={params.clientId}
        />
      </div>
    </div>
  );
}
