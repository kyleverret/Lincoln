import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return format(new Date(date), "MMM d, yyyy");
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return format(new Date(date), "MMM d, yyyy h:mm a");
}

export function formatRelativeTime(
  date: Date | string | null | undefined
): string {
  if (!date) return "—";
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function formatFileSize(bytes: number | bigint): string {
  const n = typeof bytes === "bigint" ? Number(bytes) : bytes;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function getInitials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

export function generateMatterNumber(sequence: number): string {
  const year = new Date().getFullYear();
  return `${year}-${String(sequence).padStart(4, "0")}`;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const PRIORITY_COLORS = {
  LOW: "bg-slate-100 text-slate-700",
  MEDIUM: "bg-blue-100 text-blue-700",
  HIGH: "bg-amber-100 text-amber-700",
  URGENT: "bg-red-100 text-red-700",
} as const;

export const STATUS_COLORS = {
  INTAKE: "bg-purple-100 text-purple-700",
  ACTIVE: "bg-green-100 text-green-700",
  PENDING_CLIENT: "bg-yellow-100 text-yellow-700",
  PENDING_COURT: "bg-orange-100 text-orange-700",
  CLOSED: "bg-slate-100 text-slate-600",
  ARCHIVED: "bg-slate-100 text-slate-400",
} as const;

export const STATUS_LABELS = {
  INTAKE: "Intake",
  ACTIVE: "Active",
  PENDING_CLIENT: "Pending Client",
  PENDING_COURT: "Pending Court",
  CLOSED: "Closed",
  ARCHIVED: "Archived",
} as const;

export const PRIORITY_LABELS = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
} as const;

export const DOCUMENT_CATEGORY_LABELS = {
  PLEADING: "Pleading",
  DISCOVERY: "Discovery",
  CORRESPONDENCE: "Correspondence",
  CONTRACT: "Contract",
  EVIDENCE: "Evidence",
  COURT_ORDER: "Court Order",
  INTAKE: "Intake",
  BILLING: "Billing",
  OTHER: "Other",
} as const;
