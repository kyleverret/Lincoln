"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Send, Plus, MessageSquare, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserRole } from "@prisma/client";

interface Contact {
  id: string;
  name: string;
  role: string;
}

interface Matter {
  id: string;
  title: string;
  matterNumber: string;
}

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  recipientIds: string[];
  subject: string | null;
  body: string;
  isInternal: boolean;
  matter: { id: string; title: string; matterNumber: string } | null;
  createdAt: string;
}

interface Props {
  contacts: Contact[];
  matters: Matter[];
  currentUserId: string;
  userRole: UserRole;
}

export function MessagesClient({ contacts, matters, currentUserId, userRole }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [composing, setComposing] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState<string>("");
  const [selectedMatter, setSelectedMatter] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<"all" | "sent" | "received">("all");

  const loadMessages = useCallback(async () => {
    const res = await fetch("/api/messages");
    if (res.ok) setMessages(await res.json());
  }, []);

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 30_000);
    return () => clearInterval(interval);
  }, [loadMessages]);

  async function handleSend() {
    if (!selectedRecipient || !body.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientIds: [selectedRecipient],
          subject: subject || undefined,
          body: body.trim(),
          matterId: selectedMatter || undefined,
          isInternal,
        }),
      });
      if (res.ok) {
        setComposing(false);
        setSelectedRecipient("");
        setSelectedMatter("");
        setSubject("");
        setBody("");
        setIsInternal(false);
        await loadMessages();
      }
    } finally {
      setSending(false);
    }
  }

  const filtered = messages.filter((m) => {
    if (filter === "sent") return m.senderId === currentUserId;
    if (filter === "received") return m.senderId !== currentUserId;
    return true;
  });

  const isClient = userRole === UserRole.CLIENT;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="border-b px-6 py-3 flex items-center gap-3">
        {composing ? (
          <Button variant="ghost" size="sm" onClick={() => setComposing(false)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        ) : (
          <>
            <Button size="sm" onClick={() => setComposing(true)}>
              <Plus className="h-4 w-4 mr-1" /> New Message
            </Button>
            <div className="flex gap-1 ml-4">
              {(["all", "sent", "received"] as const).map((f) => (
                <Button
                  key={f}
                  variant={filter === f ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter(f)}
                  className="capitalize text-xs"
                >
                  {f}
                </Button>
              ))}
            </div>
          </>
        )}
      </div>

      {composing ? (
        /* Compose form */
        <div className="flex-1 p-6 max-w-2xl space-y-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium mb-1">To</label>
            <select
              value={selectedRecipient}
              onChange={(e) => setSelectedRecipient(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select recipient...</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.role})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Related Case (optional)</label>
            <select
              value={selectedMatter}
              onChange={(e) => setSelectedMatter(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">None</option>
              {matters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.matterNumber} — {m.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Subject (optional)</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject..."
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              placeholder="Type your message..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
            />
          </div>

          {!isClient && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isInternal}
                onChange={(e) => setIsInternal(e.target.checked)}
                className="rounded border-gray-300"
              />
              Internal only (not visible to clients)
            </label>
          )}

          <Button
            onClick={handleSend}
            disabled={!selectedRecipient || !body.trim() || sending}
            size="sm"
          >
            <Send className="h-4 w-4 mr-1" />
            {sending ? "Sending..." : "Send Message"}
          </Button>
        </div>
      ) : (
        /* Message list */
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <MessageSquare className="h-10 w-10 text-muted-foreground mb-3" />
              <h3 className="text-lg font-medium">No messages</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Start a conversation by clicking "New Message"
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((msg) => {
                const isSent = msg.senderId === currentUserId;
                const recipientNames = msg.recipientIds
                  .map((rid) => contacts.find((c) => c.id === rid)?.name ?? "Unknown")
                  .join(", ");
                return (
                  <div
                    key={msg.id}
                    className="px-6 py-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">
                            {isSent ? `To: ${recipientNames}` : `From: ${msg.senderName}`}
                          </span>
                          {msg.isInternal && (
                            <Badge variant="outline" className="text-xs">Internal</Badge>
                          )}
                          {msg.matter && (
                            <Badge variant="secondary" className="text-xs">
                              {msg.matter.matterNumber}
                            </Badge>
                          )}
                        </div>
                        {msg.subject && (
                          <p className="text-sm font-medium mt-0.5">{msg.subject}</p>
                        )}
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {msg.body}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                        {new Date(msg.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
