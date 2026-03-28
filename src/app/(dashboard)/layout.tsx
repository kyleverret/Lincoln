import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { Sidebar } from "@/components/layout/sidebar";
import { SidebarProvider } from "@/components/layout/sidebar-context";
import { db } from "@/lib/db";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role === UserRole.CLIENT) {
    redirect("/portal");
  }

  // Fetch firm name for the sidebar
  let firmName: string | undefined;
  if (session.user.tenantId) {
    const tenant = await db.tenant.findUnique({
      where: { id: session.user.tenantId },
      select: { name: true },
    });
    firmName = tenant?.name;
  }

  const user = {
    id: session.user.id,
    firstName: session.user.firstName,
    lastName: session.user.lastName,
    email: session.user.email!,
    role: session.user.role,
    tenantId: session.user.tenantId,
  };

  return (
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar user={user} firmName={firmName} />
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <main className="flex-1 overflow-y-auto bg-slate-50/50">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
