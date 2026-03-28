import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { IntakeForm } from "@/components/clients/intake-form";

export const metadata = { title: "Client Intake" };

export default async function IntakePage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  return (
    <div>
      <Header title="Client Intake" role={session.user.role} />
      <div className="p-4 sm:p-6 max-w-2xl">
        <IntakeForm tenantId={session.user.tenantId} />
      </div>
    </div>
  );
}
