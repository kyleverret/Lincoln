import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { Scale } from "lucide-react";
import { PublicIntakeForm } from "@/components/clients/public-intake-form";

interface PageProps {
  params: Promise<{ tenantSlug: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { name: true },
  });
  return { title: tenant ? `Contact ${tenant.name}` : "Intake Form" };
}

export default async function PublicIntakePage({ params }: PageProps) {
  const { tenantSlug } = await params;

  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, name: true, isActive: true },
  });

  if (!tenant || !tenant.isActive) notFound();

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8 flex items-center justify-center gap-2">
          <Scale className="h-8 w-8 text-primary" />
          <span className="text-2xl font-bold">{tenant.name}</span>
        </div>
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold">Request a Consultation</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Fill out the form below and our team will get back to you promptly.
          </p>
        </div>
        <PublicIntakeForm tenantSlug={tenantSlug} />
      </div>
    </div>
  );
}
