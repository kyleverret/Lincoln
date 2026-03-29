"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Globe, KeyRound, Copy, Check } from "lucide-react";

interface Props {
  clientId: string;
  portalEnabled: boolean;
  clientEmail: string;
}

export function PortalAccessButton({ clientId, portalEnabled, clientEmail }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ portalEmail: string; temporaryPassword: string; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleEnable() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/portal`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "An error occurred");
        return;
      }
      setResult(data);
      setOpen(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function copyPassword() {
    if (!result) return;
    await navigator.clipboard.writeText(result.temporaryPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      {error && (
        <p className="text-xs text-red-600 mt-1">{error}</p>
      )}
      <Button
        size="sm"
        variant="outline"
        onClick={handleEnable}
        disabled={loading}
        className="gap-1.5"
      >
        {portalEnabled ? (
          <KeyRound className="h-3.5 w-3.5" />
        ) : (
          <Globe className="h-3.5 w-3.5" />
        )}
        {loading ? "Processing..." : portalEnabled ? "Reset Portal Password" : "Enable Portal"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {portalEnabled ? "Portal Password Reset" : "Portal Access Enabled"}
            </DialogTitle>
            <DialogDescription>
              Share these credentials securely with the client. The password cannot be retrieved after closing this dialog.
            </DialogDescription>
          </DialogHeader>
          {result && (
            <div className="space-y-4 mt-2">
              <div className="rounded-md bg-slate-50 border p-3 space-y-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Portal Login URL</p>
                  <p className="font-mono text-xs mt-0.5">/portal/login</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Email</p>
                  <p className="font-mono text-xs mt-0.5">{clientEmail}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Temporary Password</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="font-mono text-sm font-bold tracking-wide">{result.temporaryPassword}</p>
                    <button
                      onClick={copyPassword}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      title="Copy password"
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5 text-green-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md p-2">
                This password is shown once. The client should change it after first login.
              </p>
              <Button className="w-full" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
