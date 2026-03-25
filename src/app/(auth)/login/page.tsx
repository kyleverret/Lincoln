import { LoginForm } from "@/components/auth/login-form";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";

export const metadata = { title: "Sign In" };

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) {
    if (session.user.role === UserRole.CLIENT) redirect("/portal");
    redirect("/dashboard");
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold">Sign in</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Enter your credentials to access your account
        </p>
      </div>
      <LoginForm />
    </div>
  );
}
