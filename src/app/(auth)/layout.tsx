import { Scale } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="mb-8 flex items-center gap-2">
        <Scale className="h-8 w-8 text-primary" />
        <span className="text-2xl font-bold">Lincoln</span>
      </div>
      {children}
      <p className="mt-8 text-xs text-muted-foreground text-center max-w-sm">
        This platform uses HIPAA-compliant security measures including
        AES-256-GCM encryption, multi-factor authentication, and comprehensive
        audit logging.
      </p>
    </div>
  );
}
