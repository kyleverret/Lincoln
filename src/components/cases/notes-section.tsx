"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Edit2, Trash2, Check, X } from "lucide-react";

export interface NoteItem {
  id: string;
  content: string; // already decrypted by server
  isInternal: boolean;
  createdAt: string;
  authorId: string;
  authorName: string;
  canEdit: boolean; // precomputed: isAuthor && within24hrs OR isAdmin
  canDelete: boolean; // same
}

interface NotesSectionProps {
  matterId: string;
  notes: NoteItem[];
  canAddNote: boolean;
}

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

export function NotesSection({
  matterId,
  notes: initialNotes,
  canAddNote,
}: NotesSectionProps) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);

  // Add-note form state
  const [addContent, setAddContent] = useState("");
  const [addInternal, setAddInternal] = useState(true);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addContent.trim()) return;
    setAddSaving(true);
    setAddError("");

    const res = await fetch(`/api/cases/${matterId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: addContent.trim(), isInternal: addInternal }),
    });

    if (!res.ok) {
      const data = await res.json();
      setAddError(data.error ?? "Failed to add note");
      setAddSaving(false);
      return;
    }

    setAddContent("");
    setAddInternal(true);
    setAddSaving(false);
    router.refresh();
  }

  function startEdit(note: NoteItem) {
    setEditingId(note.id);
    setEditContent(note.content);
    setEditError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditContent("");
    setEditError("");
  }

  async function handleEdit(noteId: string) {
    if (!editContent.trim()) return;
    setEditSaving(true);
    setEditError("");

    const res = await fetch(`/api/cases/${matterId}/notes/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: editContent.trim() }),
    });

    if (!res.ok) {
      const data = await res.json();
      setEditError(data.error ?? "Failed to update note");
      setEditSaving(false);
      return;
    }

    setNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, content: editContent.trim() } : n))
    );
    setEditingId(null);
    setEditSaving(false);
  }

  async function handleDelete(noteId: string) {
    if (!confirm("Delete this note? This cannot be undone.")) return;

    const res = await fetch(`/api/cases/${matterId}/notes/${noteId}`, {
      method: "DELETE",
    });

    if (!res.ok && res.status !== 204) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Failed to delete note");
      return;
    }

    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {canAddNote && (
        <form onSubmit={handleAdd} className="space-y-3">
          <Textarea
            placeholder="Add a note..."
            value={addContent}
            onChange={(e) => setAddContent(e.target.value)}
            rows={3}
            required
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="addInternal"
                checked={addInternal}
                onChange={(e) => setAddInternal(e.target.checked)}
                className="rounded border-gray-300"
              />
              <Label htmlFor="addInternal" className="text-sm">
                Internal (not visible to client)
              </Label>
            </div>
            <Button type="submit" size="sm" disabled={addSaving || !addContent.trim()}>
              {addSaving ? "Adding..." : "Add Note"}
            </Button>
          </div>
          {addError && (
            <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{addError}</p>
          )}
        </form>
      )}

      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No notes yet.</p>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note.id} className="rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between mb-1 gap-2">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="text-xs font-medium text-muted-foreground">
                    {note.authorName}
                  </span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTime(note.createdAt)}
                  </span>
                  {note.isInternal && (
                    <Badge variant="outline" className="text-xs py-0">
                      Internal
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {note.canEdit && editingId !== note.id && (
                    <button
                      onClick={() => startEdit(note)}
                      className="p-1 rounded hover:bg-slate-100 text-muted-foreground hover:text-foreground transition-colors"
                      title="Edit note"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {note.canDelete && editingId !== note.id && (
                    <button
                      onClick={() => handleDelete(note.id)}
                      className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"
                      title="Delete note"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {editingId === note.id ? (
                <div className="space-y-2 mt-2">
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={3}
                    autoFocus
                  />
                  {editError && (
                    <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">{editError}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(note.id)}
                      disabled={editSaving || !editContent.trim()}
                      className="flex items-center gap-1 text-xs rounded-md bg-primary px-3 py-1.5 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      <Check className="h-3 w-3" />
                      {editSaving ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="flex items-center gap-1 text-xs rounded-md border px-3 py-1.5 hover:bg-slate-50"
                    >
                      <X className="h-3 w-3" />
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{note.content}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
