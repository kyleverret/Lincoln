import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import Link from "next/link";
import { InvoiceStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

export const metadata = { title: "Invoice — Lincoln" };

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  SENT: "bg-blue-100 text-blue-700",
  VIEWED: "bg-blue-100 text-blue-700",
  PARTIAL: "bg-orange-100 text-orange-700",
  PAID: "bg-green-100 text-green-700",
  OVERDUE: "bg-red-100 text-red-700",
  VOID: "bg-slate-100 text-slate-400",
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (!hasPermission(session.user.role, "BILLING_READ")) {
    redirect("/dashboard");
  }

  const { id } = await params;

  const invoice = await db.invoice.findFirst({
    where: { id, tenantId: session.user.tenantId ?? undefined },
    include: {
      matter: { select: { id: true, title: true, matterNumber: true } },
      lineItems: { orderBy: { position: "asc" } },
      payments: { orderBy: { paidAt: "desc" } },
    },
  });

  if (!invoice) notFound();

  const balance = Number(invoice.totalAmount) - Number(invoice.amountPaid);
  const canRecordPayment = hasPermission(session.user.role, "PAYMENT_RECORD");

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{invoice.invoiceNumber}</h1>
            <span
              className={cn(
                "text-xs font-medium px-2 py-1 rounded-full",
                STATUS_COLORS[invoice.status]
              )}
            >
              {invoice.status}
            </span>
          </div>
          <p className="text-muted-foreground mt-1">
            <Link href={`/cases/${invoice.matter.id}`} className="hover:underline text-primary">
              {invoice.matter.matterNumber}
            </Link>{" "}
            · {invoice.matter.title}
          </p>
        </div>
        <Link
          href="/billing/invoices"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back
        </Link>
      </div>

      {/* Invoice details */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-muted-foreground">Issue Date</p>
          <p className="font-medium mt-1">{new Date(invoice.issueDate).toLocaleDateString()}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-muted-foreground">Due Date</p>
          <p className="font-medium mt-1">{new Date(invoice.dueDate).toLocaleDateString()}</p>
        </div>
        {invoice.terms && (
          <div className="rounded-lg border bg-white p-4">
            <p className="text-xs text-muted-foreground">Terms</p>
            <p className="font-medium mt-1">{invoice.terms}</p>
          </div>
        )}
      </div>

      {/* Line items */}
      <section>
        <h2 className="font-semibold mb-3">Line Items</h2>
        <div className="rounded-lg border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Description</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Qty</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Rate</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lineItems.map((li) => (
                <tr key={li.id} className="border-b last:border-0">
                  <td className="px-4 py-3">{li.description}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{li.type.replace("_", " ")}</td>
                  <td className="px-4 py-3 text-right">{Number(li.quantity).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">
                    ${Number(li.unitPrice).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    ${Number(li.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Totals */}
          <div className="border-t bg-slate-50 px-4 py-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>${Number(invoice.subtotal).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
            </div>
            {Number(invoice.taxAmount) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  Tax ({(Number(invoice.taxRate) * 100).toFixed(2)}%)
                </span>
                <span>${Number(invoice.taxAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-sm border-t pt-1 mt-1">
              <span>Total</span>
              <span>${Number(invoice.totalAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
            </div>
            {Number(invoice.amountPaid) > 0 && (
              <div className="flex justify-between text-sm text-green-700">
                <span>Paid</span>
                <span>-${Number(invoice.amountPaid).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            {balance > 0 && (
              <div className="flex justify-between font-bold text-sm text-red-600">
                <span>Balance Due</span>
                <span>${balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Payments */}
      {invoice.payments.length > 0 && (
        <section>
          <h2 className="font-semibold mb-3">Payments</h2>
          <div className="space-y-2">
            {invoice.payments.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border bg-white p-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    {p.method.replace("_", " ")}
                    {p.reference ? ` — ${p.reference}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(p.paidAt).toLocaleDateString()}
                    {p.notes ? ` · ${p.notes}` : ""}
                  </p>
                </div>
                <span className="text-green-700 font-medium text-sm">
                  ${Number(p.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Notes */}
      {invoice.notes && (
        <section>
          <h2 className="font-semibold mb-2">Notes</h2>
          <p className="text-sm text-muted-foreground bg-white rounded-lg border p-4">
            {invoice.notes}
          </p>
        </section>
      )}

      {/* Record payment CTA */}
      {canRecordPayment && balance > 0 && invoice.status !== "VOID" && (
        <div className="flex gap-3 pt-2">
          <Link
            href={`/billing/invoices/${invoice.id}/payment`}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
          >
            Record Payment
          </Link>
        </div>
      )}
    </div>
  );
}
