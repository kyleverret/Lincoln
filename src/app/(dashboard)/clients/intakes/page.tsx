import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { hasPermission } from "@/lib/permissions";
import { IntakeReviewClient } from "@/components/clients/intake-review-client";

export const metadata = { title: "Intake Review" };

export default async function IntakeReviewPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const { tenantId, role } = session.user;

  if (!hasPermission(role, "CLIENT_CREATE")) {
    redirect("/dashboard");
  }

  const intakes = await db.intakeForm.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      practiceArea: true,
      submittedAt: true,
      reviewedAt: true,
      createdAt: true,
    },
    take: 100,
  });

  return (
    <div className="flex flex-col h-full">
      <Header title="Intake Review" role={role} />
      <IntakeReviewClient intakes={intakes} />
    </div>
  );
}
