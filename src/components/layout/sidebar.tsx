"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Briefcase,
  Users,
  FolderOpen,
  Settings,
  Shield,
  MessageSquare,
  ClipboardList,
  LogOut,
  Scale,
  KanbanSquare,
  CheckSquare,
  BookUser,
  Receipt,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UserRole } from "@prisma/client";
import { signOut } from "next-auth/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import { NotificationBell } from "./NotificationBell";
import { useSidebar } from "./sidebar-context";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles?: UserRole[];
  exact?: boolean;
}

const PRIMARY_NAV: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    href: "/cases/board",
    label: "Case Project Management",
    icon: KanbanSquare,
  },
  {
    href: "/action-items",
    label: "Action Items",
    icon: CheckSquare,
  },
  {
    href: "/cases",
    label: "Cases",
    icon: Briefcase,
  },
  {
    href: "/clients",
    label: "Clients",
    icon: Users,
  },
  {
    href: "/contacts",
    label: "Contacts",
    icon: BookUser,
  },
  {
    href: "/billing",
    label: "Billing",
    icon: Receipt,
    roles: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN, UserRole.ATTORNEY],
  },
];

const SECONDARY_NAV: NavItem[] = [
  {
    href: "/documents",
    label: "Documents",
    icon: FolderOpen,
  },
  {
    href: "/messages",
    label: "Messages",
    icon: MessageSquare,
  },
  {
    href: "/clients/intakes",
    label: "Intake Review",
    icon: ClipboardList,
    roles: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN, UserRole.ATTORNEY],
  },
  {
    href: "/admin",
    label: "Admin",
    icon: Shield,
    roles: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN],
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
  },
];

interface SidebarProps {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: UserRole;
    tenantId: string | null;
  };
  firmName?: string;
}

function NavLink({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const isActive = item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(item.href + "/");

  const isCasesItem = item.href === "/cases";
  const finalActive = isCasesItem
    ? pathname === "/cases" ||
      (pathname.startsWith("/cases/") && !pathname.startsWith("/cases/board"))
    : isActive;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        finalActive
          ? "bg-primary text-primary-foreground"
          : "text-slate-700 hover:bg-slate-200 hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {item.label}
    </Link>
  );
}

export function Sidebar({ user, firmName }: SidebarProps) {
  const pathname = usePathname();
  const { isOpen, close } = useSidebar();

  const visiblePrimary = PRIMARY_NAV.filter(
    (item) => !item.roles || item.roles.includes(user.role)
  );
  const visibleSecondary = SECONDARY_NAV.filter(
    (item) => !item.roles || item.roles.includes(user.role)
  );

  return (
    <>
      {/* Mobile backdrop overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={cn(
          "flex h-screen w-64 flex-col border-r bg-slate-50 transition-transform duration-300 ease-in-out",
          // Mobile: fixed overlay that slides in/out
          "fixed inset-y-0 left-0 z-50",
          // Desktop: static, always visible
          "md:static md:translate-x-0 md:z-auto",
          // Mobile open/close state
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Logo / Firm Name */}
        <div className="flex h-16 items-center gap-3 border-b px-6">
          <Scale className="h-6 w-6 text-primary shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-foreground truncate">
              {firmName ?? "Lincoln"}
            </p>
            <p className="text-xs text-muted-foreground">Case Management</p>
          </div>
          {/* Close button on mobile */}
          <button
            onClick={close}
            className="md:hidden flex items-center justify-center rounded-md p-1 text-slate-500 hover:bg-slate-200 transition-colors"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          <ul className="space-y-1">
            {visiblePrimary.map((item) => (
              <li key={item.href}>
                <NavLink item={item} pathname={pathname} onNavigate={close} />
              </li>
            ))}
          </ul>

          <div className="my-3 border-t border-slate-200" />

          <ul className="space-y-1">
            {visibleSecondary.map((item) => (
              <li key={item.href}>
                <NavLink item={item} pathname={pathname} onNavigate={close} />
              </li>
            ))}
          </ul>
        </nav>

        {/* User footer */}
        <div className="border-t p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <NotificationBell />
          </div>
          <div className="flex items-center gap-3 mb-3">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                {getInitials(user.firstName, user.lastName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {user.email}
              </p>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-200 hover:text-foreground transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
