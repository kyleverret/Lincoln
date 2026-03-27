import { ROLE_LABELS } from "@/lib/permissions";
import { UserRole } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { NotificationBell } from "@/components/layout/NotificationBell";

interface HeaderProps {
  title: string;
  role: UserRole;
  actions?: React.ReactNode;
}

export function Header({ title, role, actions }: HeaderProps) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b bg-background px-6">
      <h1 className="text-lg font-semibold">{title}</h1>
      <div className="flex items-center gap-3">
        {actions}
        <Badge variant="secondary" className="hidden sm:inline-flex">
          {ROLE_LABELS[role]}
        </Badge>
        <NotificationBell />
      </div>
    </header>
  );
}
