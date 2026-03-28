import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { db } from "@/lib/db";
import Link from "next/link";
import { Scale, Home, FolderOpen, MessageSquare, LogOut } from "lucide-react";
import { getInitials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) redirect("/portal/login");
  if (session.user.role !== UserRole.CLIENT) redirect("/dashboard");

  // Find client record
  const client = await db.client.findFirst({
    where: { portalUserId: session.user.id },
    include: { tenant: { select: { name: true } } },
  });

  if (!client) redirect("/portal/login");

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Portal header */}
      <header className="border-b bg-white shadow-sm">
        <div className="mx-auto max-w-5xl flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Scale className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-bold">{client.tenant.name}</p>
              <p className="text-xs text-muted-foreground">Client Portal</p>
            </div>
          </div>

          <nav className="flex items-center gap-4">
            <Link
              href="/portal"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Home className="h-4 w-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
            <Link
              href="/portal/documents"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <FolderOpen className="h-4 w-4" />
              <span className="hidden sm:inline">Documents</span>
            </Link>
            <Link
              href="/portal/messages"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Messages</span>
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                {getInitials(client.firstName, client.lastName)}
              </AvatarFallback>
            </Avatar>
            <div className="hidden sm:block">
              <p className="text-sm font-medium">
                {client.firstName} {client.lastName}
              </p>
              <p className="text-xs text-muted-foreground">{client.email}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-4 sm:py-8">{children}</main>
    </div>
  );
}
