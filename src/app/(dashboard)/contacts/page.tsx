import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import Link from "next/link";
import { ContactType } from "@prisma/client";
import { cn } from "@/lib/utils";
import { DeleteContactButton } from "@/components/contacts/delete-contact-button";

export const metadata = { title: "Contacts — Lincoln" };

const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  OPPOSING_COUNSEL: "Opposing Counsel",
  WITNESS: "Witness",
  EXPERT: "Expert",
  VENDOR: "Vendor",
  COURT_CONTACT: "Court Contact",
  OTHER: "Other",
};

const CONTACT_TYPE_COLORS: Record<ContactType, string> = {
  OPPOSING_COUNSEL: "bg-red-100 text-red-700",
  WITNESS: "bg-blue-100 text-blue-700",
  EXPERT: "bg-purple-100 text-purple-700",
  VENDOR: "bg-green-100 text-green-700",
  COURT_CONTACT: "bg-orange-100 text-orange-700",
  OTHER: "bg-slate-100 text-slate-600",
};

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; type?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (!hasPermission(session.user.role, "CONTACT_READ")) {
    redirect("/dashboard");
  }

  const { search, type } = await searchParams;

  const contacts = await db.contact.findMany({
    where: {
      tenantId: session.user.tenantId ?? undefined,
      isActive: true,
      ...(type && Object.keys(CONTACT_TYPE_LABELS).includes(type)
        ? { type: type as ContactType }
        : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
              { company: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      matter: { select: { id: true, title: true, matterNumber: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const canCreate = hasPermission(session.user.role, "CONTACT_CREATE");
  const canDelete = hasPermission(session.user.role, "CONTACT_DELETE");

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contacts</h1>
          <p className="text-muted-foreground mt-1">
            Opposing counsel, witnesses, experts, and other contacts
          </p>
        </div>
        {canCreate && (
          <Link
            href="/contacts/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Add Contact
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <FilterChip href="/contacts" label="All" active={!type} />
        {Object.entries(CONTACT_TYPE_LABELS).map(([key, label]) => (
          <FilterChip
            key={key}
            href={`/contacts?type=${key}`}
            label={label}
            active={type === key}
          />
        ))}
      </div>

      {/* Contact list */}
      {contacts.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="font-medium">No contacts found</p>
          {canCreate && (
            <Link href="/contacts/new" className="text-primary text-sm mt-2 block">
              Add your first contact →
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className="flex items-center justify-between rounded-lg border bg-white p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">
                    {contact.firstName} {contact.lastName}
                  </p>
                  <span
                    className={cn(
                      "text-xs font-medium px-2 py-0.5 rounded-full",
                      CONTACT_TYPE_COLORS[contact.type]
                    )}
                  >
                    {CONTACT_TYPE_LABELS[contact.type]}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                  {contact.company && (
                    <p className="text-xs text-muted-foreground">{contact.company}</p>
                  )}
                  {contact.title && (
                    <p className="text-xs text-muted-foreground">{contact.title}</p>
                  )}
                  {contact.email && (
                    <a
                      href={`mailto:${contact.email}`}
                      className="text-xs text-primary hover:underline"
                    >
                      {contact.email}
                    </a>
                  )}
                  {contact.phone && (
                    <p className="text-xs text-muted-foreground">{contact.phone}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center ml-4 gap-2">
                {contact.matter && (
                  <div className="text-right">
                    <Link
                      href={`/cases/${contact.matter.id}`}
                      className="text-xs text-primary hover:underline"
                    >
                      {contact.matter.matterNumber}
                    </Link>
                    <p className="text-xs text-muted-foreground truncate max-w-32">
                      {contact.matter.title}
                    </p>
                  </div>
                )}
                {canDelete && (
                  <DeleteContactButton
                    contactId={contact.id}
                    contactName={`${contact.firstName} ${contact.lastName}`}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      )}
    >
      {label}
    </Link>
  );
}
