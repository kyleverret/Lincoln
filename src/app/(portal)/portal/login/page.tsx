import { Scale } from "lucide-react";
import { PortalLoginForm } from "@/components/auth/portal-login-form";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";

export const metadata = { title: "Client Portal — Sign In" };

export default async function PortalLoginPage() {
  const session = await auth();
  if (session?.user) {
    if (session.user.role === UserRole.CLIENT) redirect("/portal");
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="mb-8 flex items-center gap-2">
        <Scale className="h-8 w-8 text-primary" />
        <span className="text-2xl font-bold">Lincoln</span>
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold">Client Portal</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sign in to view your case status and documents
          </p>
        </div>
        <PortalLoginForm />
      </div>
      <p className="mt-8 text-xs text-muted-foreground text-center max-w-sm">
        This platform uses HIPAA-compliant security measures including
        AES-256-GCM encryption and comprehensive audit logging.
      </p>
    </div>
  );
}
