"use client";

import { useEffect, useState } from "react";
import {
  FileText,
  MessageSquare,
  UserPlus,
  Edit,
  Eye,
  Upload,
  Download,
  Trash2,
  CheckCircle,
  Clock,
  AlertCircle,
  DollarSign,
  Activity,
} from "lucide-react";

interface TimelineEntry {
  id: string;
  type: "audit";
  action: string;
  description: string | null;
  entityType: string | null;
  timestamp: string;
  user: string;
}

const ACTION_CONFIG: Record<
  string,
  { icon: typeof Activity; label: string; color: string }
> = {
  MATTER_CREATED: { icon: CheckCircle, label: "Matter created", color: "text-green-600" },
  MATTER_UPDATED: { icon: Edit, label: "Matter updated", color: "text-blue-600" },
  MATTER_ACCESSED: { icon: Eye, label: "Matter viewed", color: "text-gray-500" },
  MATTER_CLOSED: { icon: CheckCircle, label: "Matter closed", color: "text-purple-600" },
  DOCUMENT_UPLOADED: { icon: Upload, label: "Document uploaded", color: "text-blue-600" },
  DOCUMENT_DOWNLOADED: { icon: Download, label: "Document downloaded", color: "text-gray-500" },
  DOCUMENT_DELETED: { icon: Trash2, label: "Document deleted", color: "text-red-600" },
  DOCUMENT_ACCESSED: { icon: Eye, label: "Document viewed", color: "text-gray-500" },
  CLIENT_CREATED: { icon: UserPlus, label: "Client added", color: "text-green-600" },
  CLIENT_ACCESSED: { icon: Eye, label: "Client record viewed", color: "text-gray-500" },
  MESSAGE_SENT: { icon: MessageSquare, label: "Message sent", color: "text-blue-600" },
  TASK_CREATED: { icon: CheckCircle, label: "Task created", color: "text-green-600" },
  TASK_UPDATED: { icon: Edit, label: "Task updated", color: "text-blue-600" },
  TASK_DELETED: { icon: Trash2, label: "Task deleted", color: "text-red-600" },
  KANBAN_UPDATED: { icon: Edit, label: "Board updated", color: "text-blue-600" },
  TIME_ENTRY_CREATED: { icon: Clock, label: "Time logged", color: "text-orange-600" },
  INVOICE_CREATED: { icon: DollarSign, label: "Invoice created", color: "text-green-600" },
  INVOICE_SENT: { icon: DollarSign, label: "Invoice sent", color: "text-blue-600" },
  NOTE_CREATED: { icon: FileText, label: "Note added", color: "text-blue-600" },
};

function getActionConfig(action: string) {
  return ACTION_CONFIG[action] ?? {
    icon: Activity,
    label: action.replace(/_/g, " ").toLowerCase(),
    color: "text-gray-500",
  };
}

function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;

  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: diffDay > 365 ? "numeric" : undefined,
  });
}

interface MatterTimelineProps {
  matterId: string;
}

export function MatterTimeline({ matterId }: MatterTimelineProps) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTimeline() {
      try {
        const res = await fetch(`/api/matters/${matterId}/timeline?limit=50`);
        if (!res.ok) throw new Error("Failed to load timeline");
        const data = await res.json();
        setEntries(data.timeline);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load timeline");
      } finally {
        setLoading(false);
      }
    }
    fetchTimeline();
  }, [matterId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Clock className="mr-2 h-4 w-4 animate-spin" />
        Loading timeline...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12 text-destructive">
        <AlertCircle className="mr-2 h-4 w-4" />
        {error}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Activity className="mb-2 h-8 w-8" />
        <p>No activity recorded yet</p>
      </div>
    );
  }

  // Group entries by date
  const grouped = entries.reduce(
    (acc, entry) => {
      const date = new Date(entry.timestamp).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
      if (!acc[date]) acc[date] = [];
      acc[date].push(entry);
      return acc;
    },
    {} as Record<string, TimelineEntry[]>
  );

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([date, dayEntries]) => (
        <div key={date}>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {date}
          </h4>
          <div className="relative space-y-0">
            {/* Vertical line */}
            <div className="absolute left-3.5 top-2 bottom-2 w-px bg-border" />

            {dayEntries.map((entry) => {
              const config = getActionConfig(entry.action);
              const Icon = config.icon;

              return (
                <div key={entry.id} className="relative flex gap-3 py-2">
                  <div
                    className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-background border ${config.color}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-medium">{entry.user}</span>
                      <span className="text-sm text-muted-foreground">
                        {config.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(entry.timestamp)}
                      </span>
                    </div>
                    {entry.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground truncate">
                        {entry.description}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
