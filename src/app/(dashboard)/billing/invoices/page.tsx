import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import Link from "next/link";
import { InvoiceStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

export const metadata = { title: "Invoices — Lincoln" };

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  VIEWED: "Viewed",
  PARTIAL: "Partial",
  PAID: "Paid",
  OVERDUE: "Overdue",
  VOID: "Void",
};

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  SENT: "bg-blue-100 text-blue-700",
  VIEWED: "bg-blue-100 text-blue-700",
  PARTIAL: "bg-orange-100 text-orange-700",
  PAID: "bg-green-100 text-green-700",
  OVERDUE: "bg-red-100 text-red-700",
  VOID: "bg-slate-100 text-slate-400",
};

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.user.tenantId) redirect("/login");

  if (!hasPermission(session.user.role, "BILLING_READ")) {
    redirect("/dashboard");
  }

  const { status } = await searchParams;
  const statusFilter =
    status && Object.keys(STATUS_LABELS).includes(status)
      ? (status as InvoiceStatus)
      : undefined;

  const invoices = await db.invoice.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    include: {
      matter: { select: { id: true, title: true, matterNumber: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const canCreate = hasPermission(session.user.role, "INVOICE_CREATE");

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Invoices</h1>
        {canCreate && (
          <Link
            href="/billing/invoices/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            New Invoice
          </Link>
        )}
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/billing/invoices"
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            !statusFilter
              ? "bg-primary text-primary-foreground"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          )}
        >
          All
        </Link>
        {Object.entries(STATUS_LABELS).map(([key, label]) => (
          <Link
            key={key}
            href={`/billing/invoices?status=${key}`}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              statusFilter === key
                ? "bg-primary text-primary-foreground"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Table */}
      {invoices.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="font-medium">No invoices found</p>
          {canCreate && (
            <Link href="/billing/invoices/new" className="text-primary text-sm mt-2 block">
              Create your first invoice →
            </Link>
          )}
        </div>
      ) : (
        <div className="rounded-lg border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Invoice #</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Matter</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Issue Date</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Due Date</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Balance</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const balance = Number(inv.totalAmount) - Number(inv.amountPaid);
                return (
                  <tr key={inv.id} className="border-b last:border-0 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/billing/invoices/${inv.id}`} className="text-primary hover:underline font-medium">
                        {inv.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/cases/${inv.matter.id}`} className="hover:underline">
                        <span className="text-muted-foreground">{inv.matter.matterNumber}</span>{" "}
                        <span className="truncate max-w-[200px] block">{inv.matter.title}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(inv.issueDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(inv.dueDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      ${Number(inv.totalAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={balance > 0 ? "text-red-600 font-medium" : "text-green-600"}>
                        ${balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", STATUS_COLORS[inv.status])}>
                        {STATUS_LABELS[inv.status]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
