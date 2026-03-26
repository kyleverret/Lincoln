"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";

export function CsvImportButton({ accountId }: { accountId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);

    const text = await file.text();
    const res = await fetch(`/api/billing/trust/accounts/${accountId}/import`, {
      method: "POST",
      headers: { "Content-Type": "text/csv" },
      body: text,
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Import failed");
    } else {
      router.refresh();
    }

    setLoading(false);
    // Reset so the same file can be re-selected
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleFile}
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => fileRef.current?.click()}
        disabled={loading}
      >
        <Upload className="h-3.5 w-3.5 mr-1.5" />
        {loading ? "Importing…" : "Import CSV"}
      </Button>
      {error && (
        <p className="text-xs text-red-600 mt-1">{error}</p>
      )}
    </div>
  );
}
