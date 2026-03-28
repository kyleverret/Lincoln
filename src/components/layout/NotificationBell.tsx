"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  async function load() {
    const res = await fetch("/api/notifications?unread=false");
    if (res.ok) {
      const data = await res.json();
      setNotifications(data);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, []);

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
    );
  }

  async function markAllRead() {
    await fetch("/api/notifications", { method: "PATCH" });
    setNotifications((prev) =>
      prev.map((n) => n.readAt ? n : { ...n, readAt: new Date().toISOString() })
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="relative flex items-center justify-center rounded-md p-1.5 text-slate-600 hover:bg-slate-200 hover:text-foreground transition-colors">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="right"
        className="w-[calc(100vw-2rem)] sm:w-80 p-0 max-h-96 overflow-y-auto"
      >
        <div className="border-b px-4 py-3 flex items-center justify-between sticky top-0 bg-white z-10">
          <p className="text-sm font-semibold">Notifications</p>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-auto py-0.5"
              onClick={markAllRead}
            >
              Mark all read
            </Button>
          )}
        </div>
        {notifications.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No notifications
          </p>
        ) : (
          <ul>
            {notifications.map((n) => (
              <li
                key={n.id}
                className={cn(
                  "border-b last:border-0 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors",
                  !n.readAt && "bg-blue-50"
                )}
                onClick={() => markRead(n.id)}
              >
                <p className="text-sm font-medium">{n.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {n.body}
                </p>
              </li>
            ))}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
