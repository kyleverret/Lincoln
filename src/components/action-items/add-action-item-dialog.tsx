"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";

interface MatterOption {
  id: string;
  title: string;
  matterNumber: string;
  kanbanCards: {
    id: string;
    title: string;
    dueDate: string | null;
    priority: string;
    column: { name: string; isTerminal: boolean };
  }[];
}

export function AddActionItemDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [matters, setMatters] = useState<MatterOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [selectedMatterId, setSelectedMatterId] = useState("");
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("MEDIUM");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError("");
    fetch("/api/action-items")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load matters");
        return res.json();
      })
      .then((data) => {
        // Filter to matters that are NOT in terminal columns
        const available = data.filter((m: MatterOption) => {
          // Include matters with no cards or with at least one non-terminal card
          if (m.kanbanCards.length === 0) return true;
          return m.kanbanCards.some((c) => !c.column.isTerminal);
        });
        setMatters(available);
      })
      .catch(() => setError("Could not load matters"))
      .finally(() => setLoading(false));
  }, [open]);

  // When a matter is selected, pre-fill title from the existing card if it has one
  useEffect(() => {
    if (!selectedMatterId) return;
    const matter = matters.find((m) => m.id === selectedMatterId);
    if (matter) {
      const activeCard = matter.kanbanCards.find((c) => !c.column.isTerminal);
      if (activeCard) {
        setTitle(activeCard.title);
        if (activeCard.dueDate) {
          setDueDate(activeCard.dueDate.slice(0, 10));
        }
        if (activeCard.priority) {
          setPriority(activeCard.priority);
        }
      } else {
        setTitle(matter.title);
      }
    }
  }, [selectedMatterId, matters]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMatterId || !title || !dueDate) return;

    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/action-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matterId: selectedMatterId,
          title,
          dueDate,
          priority,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to create action item");
      }

      setOpen(false);
      resetForm();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedMatterId("");
    setTitle("");
    setDueDate("");
    setPriority("MEDIUM");
    setError("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" aria-label="Add" />
          Add Action Item
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Action Item</DialogTitle>
          <DialogDescription>
            Set a due date and description for a matter task. This will appear on
            your action items dashboard.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
              {error}
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="matter">Matter</Label>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading matters...</p>
            ) : (
              <Select
                value={selectedMatterId}
                onValueChange={setSelectedMatterId}
              >
                <SelectTrigger id="matter">
                  <SelectValue placeholder="Select a matter" />
                </SelectTrigger>
                <SelectContent>
                  {matters.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.matterNumber} - {m.title}
                    </SelectItem>
                  ))}
                  {matters.length === 0 && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      No active matters found
                    </div>
                  )}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Description</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., File motion for summary judgment"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="URGENT">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || !selectedMatterId || !title || !dueDate}
            >
              {submitting ? "Saving..." : "Save Action Item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
