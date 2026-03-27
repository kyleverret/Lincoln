"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

export function DeleteContactButton({ contactId, contactName }: { contactId: string; contactName: string }) {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    if (!confirm(`Are you sure you want to delete ${contactName}?`)) return;

    setPending(true);
    try {
      const res = await fetch(`/api/contacts?id=${encodeURIComponent(contactId)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete contact");
      }
    } catch {
      alert("Failed to delete contact");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={pending}
      className="ml-2 rounded-md p-1.5 text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
      aria-label={`Delete ${contactName}`}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
