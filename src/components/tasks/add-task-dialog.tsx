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
}

interface AddTaskDialogProps {
  /** Pre-select a specific matter (e.g. when called from case detail view) */
  matterId?: string;
  matterTitle?: string;
  matterNumber?: string;
  /** Callback after a task is successfully created */
  onCreated?: () => void;
}

export function AddTaskDialog({
  matterId: defaultMatterId,
  matterTitle,
  matterNumber,
  onCreated,
}: AddTaskDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [matters, setMatters] = useState<MatterOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [selectedMatterId, setSelectedMatterId] = useState(defaultMatterId ?? "");
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("MEDIUM");

  // Only load the full matter list if no matter is pre-selected
  useEffect(() => {
    if (!open || defaultMatterId) return;
    setLoading(true);
    fetch("/api/cases")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: MatterOption[]) => setMatters(Array.isArray(data) ? data : []))
      .catch(() => setError("Could not load matters"))
      .finally(() => setLoading(false));
  }, [open, defaultMatterId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMatterId || !title) return;

    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matterId: selectedMatterId,
          title,
          dueDate: dueDate || undefined,
          priority,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create task");
      }

      setOpen(false);
      resetForm();
      if (onCreated) {
        onCreated();
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedMatterId(defaultMatterId ?? "");
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
          Add Task
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Task</DialogTitle>
          <DialogDescription>
            Create a new task for a case. Tasks track specific to-dos separate
            from the case stage board.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
              {error}
            </p>
          )}

          {/* Matter selector — hidden when pre-filled from case view */}
          {defaultMatterId ? (
            <div className="rounded-md bg-muted px-3 py-2 text-sm">
              <span className="text-muted-foreground">Case: </span>
              <span className="font-medium">
                {matterNumber} — {matterTitle}
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="matter">Case</Label>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading cases...</p>
              ) : (
                <Select
                  value={selectedMatterId}
                  onValueChange={setSelectedMatterId}
                >
                  <SelectTrigger id="matter">
                    <SelectValue placeholder="Select a case" />
                  </SelectTrigger>
                  <SelectContent>
                    {matters.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.matterNumber} — {m.title}
                      </SelectItem>
                    ))}
                    {matters.length === 0 && (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        No active cases found
                      </div>
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="title">Task Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., File motion for summary judgment"
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
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
              disabled={submitting || !selectedMatterId || !title}
            >
              {submitting ? "Creating..." : "Create Task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
