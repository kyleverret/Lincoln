import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import Link from "next/link";
import { InvoiceStatus } from "@prisma/client";

export const metadata = { title: "Billing — Lincoln" };

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

export default async function BillingPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (!hasPermission(session.user.role, "BILLING_READ")) {
    redirect("/dashboard");
  }

  const tenantId = session.user.tenantId ?? undefined;

  // Dashboard metrics
  const [invoices, unbilledTime, recentPayments] = await Promise.all([
    db.invoice.findMany({
      where: { tenantId },
      include: {
        matter: { select: { id: true, title: true, matterNumber: true } },
        payments: { select: { amount: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    db.timeEntry.aggregate({
      where: { tenantId, isBilled: false, isBillable: true },
      _sum: { hours: true },
    }),
    db.payment.findMany({
      where: { tenantId },
      include: { invoice: { select: { invoiceNumber: true } } },
      orderBy: { paidAt: "desc" },
      take: 5,
    }),
  ]);

  const totalOutstanding = invoices
    .filter((inv) => ["SENT", "VIEWED", "PARTIAL", "OVERDUE"].includes(inv.status))
    .reduce((sum, inv) => sum + Number(inv.totalAmount) - Number(inv.amountPaid), 0);

  const totalBilled = invoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);
  const totalCollected = invoices.reduce((sum, inv) => sum + Number(inv.amountPaid), 0);
  const overdueCount = invoices.filter((inv) => inv.status === "OVERDUE").length;

  const canCreate = hasPermission(session.user.role, "INVOICE_CREATE");

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Billing</h1>
          <p className="text-muted-foreground mt-1">
            Invoices, time tracking, and payments
          </p>
        </div>
        {canCreate && (
          <Link
            href="/billing/invoices/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            New Invoice
          </Link>
        )}
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Outstanding"
          value={`$${totalOutstanding.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          sub={`${overdueCount} overdue`}
          highlight={overdueCount > 0}
        />
        <MetricCard
          label="Total Billed"
          value={`$${totalBilled.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          sub="all time"
        />
        <MetricCard
          label="Collected"
          value={`$${totalCollected.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          sub="all time"
        />
        <MetricCard
          label="Unbilled Hours"
          value={`${Number(unbilledTime._sum.hours ?? 0).toFixed(1)}h`}
          sub="ready to invoice"
        />
      </div>

      {/* Quick nav */}
      <div className="flex gap-3">
        <Link
          href="/billing/invoices"
          className="rounded-md border bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 transition-colors"
        >
          All Invoices
        </Link>
        <Link
          href="/billing/time"
          className="rounded-md border bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 transition-colors"
        >
          Time Entries
        </Link>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Recent invoices */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Recent Invoices</h2>
            <Link href="/billing/invoices" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No invoices yet</p>
            ) : (
              invoices.slice(0, 8).map((inv) => (
                <Link
                  key={inv.id}
                  href={`/billing/invoices/${inv.id}`}
                  className="flex items-center justify-between rounded-lg border bg-white p-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{inv.invoiceNumber}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {inv.matter.matterNumber} · {inv.matter.title}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-3 shrink-0">
                    <span className="text-sm font-medium">
                      ${Number(inv.totalAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[inv.status]}`}
                    >
                      {STATUS_LABELS[inv.status]}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>

        {/* Recent payments */}
        <section>
          <h2 className="font-semibold mb-3">Recent Payments</h2>
          <div className="space-y-2">
            {recentPayments.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No payments recorded</p>
            ) : (
              recentPayments.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border bg-white p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{p.invoice.invoiceNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.method.replace("_", " ")} ·{" "}
                      {new Date(p.paidAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-green-700">
                    +${Number(p.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
        {label}
      </p>
      <p
        className={`text-2xl font-bold mt-1 ${highlight ? "text-red-600" : "text-foreground"}`}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
    </div>
  );
}
