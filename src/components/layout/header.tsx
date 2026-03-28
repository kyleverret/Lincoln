import { ROLE_LABELS } from "@/lib/permissions";
import { UserRole } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { MobileMenuButton } from "@/components/layout/mobile-menu-button";

interface HeaderProps {
  title: string;
  role: UserRole;
  actions?: React.ReactNode;
}

export function Header({ title, role, actions }: HeaderProps) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b bg-background px-4 sm:px-6">
      <div className="flex items-center gap-3 min-w-0">
        <MobileMenuButton />
        <h1 className="text-base sm:text-lg font-semibold truncate">{title}</h1>
      </div>
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {actions}
        <Badge variant="secondary" className="hidden sm:inline-flex">
          {ROLE_LABELS[role]}
        </Badge>
        <NotificationBell />
      </div>
    </header>
  );
}
