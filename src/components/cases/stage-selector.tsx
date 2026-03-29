"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Column {
  id: string;
  name: string;
  color: string;
  isTerminal: boolean;
}

interface StageSelectorProps {
  cardId: string;
  currentColumnId: string;
  columns: Column[];
}

export function StageSelector({ cardId, currentColumnId, columns }: StageSelectorProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(currentColumnId);

  const currentCol = columns.find((c) => c.id === selected);

  async function handleChange(newColumnId: string) {
    if (newColumnId === selected || saving) return;
    setSaving(true);
    const prev = selected;
    setSelected(newColumnId);
    try {
      const res = await fetch(`/api/kanban/cards/${cardId}/move`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetColumnId: newColumnId, newPosition: 0 }),
      });
      if (!res.ok) throw new Error("Failed to move card");
      router.refresh();
    } catch {
      setSelected(prev);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div
        className="w-2.5 h-2.5 rounded-full shrink-0"
        style={{ backgroundColor: currentCol?.color ?? "#6b7280" }}
      />
      <Select value={selected} onValueChange={handleChange} disabled={saving}>
        <SelectTrigger className="h-7 text-xs border-none shadow-none px-1 w-auto gap-1 focus:ring-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {columns.map((col) => (
            <SelectItem key={col.id} value={col.id} className="text-xs">
              <span className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ backgroundColor: col.color }}
                />
                {col.name}
                {col.isTerminal && (
                  <span className="text-green-600 font-medium"> · Done</span>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
