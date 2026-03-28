"use client";

import { Menu } from "lucide-react";
import { useSidebar } from "./sidebar-context";

export function MobileMenuButton() {
  const { toggle } = useSidebar();
  return (
    <button
      className="md:hidden flex items-center justify-center rounded-md p-1.5 text-slate-600 hover:bg-slate-200 transition-colors"
      onClick={toggle}
      aria-label="Toggle navigation menu"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}
