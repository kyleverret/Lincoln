"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, X, FileText, AlertCircle, CheckCircle } from "lucide-react";
import { formatFileSize, DOCUMENT_CATEGORY_LABELS } from "@/lib/utils";
import { cn } from "@/lib/utils";

const MAX_SIZE = parseInt(process.env.NEXT_PUBLIC_MAX_FILE_SIZE ?? "52428800");

interface Matter {
  id: string;
  title: string;
  matterNumber: string;
}

interface Client {
  id: string;
  firstName: string;
  lastName: string;
}

interface UploadFormProps {
  matters: Matter[];
  clients: Client[];
  defaultMatterId?: string;
  defaultClientId?: string;
}

export function DocumentUploadForm({
  matters,
  clients,
  defaultMatterId,
  defaultClientId,
}: UploadFormProps) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("OTHER");
  const [matterId, setMatterId] = useState(defaultMatterId ?? "");
  const [clientId, setClientId] = useState(defaultClientId ?? "");
  const [isConfidential, setIsConfidential] = useState(false);
  const [allowClientView, setAllowClientView] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const f = acceptedFiles[0];
    if (f) {
      setFile(f);
      if (!displayName) setDisplayName(f.name.replace(/\.[^/.]+$/, ""));
      setError(null);
    }
  }, [displayName]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxSize: MAX_SIZE,
    maxFiles: 1,
    onDropRejected: (rejections) => {
      const err = rejections[0]?.errors[0];
      if (err?.code === "file-too-large") {
        setError(`File too large. Maximum size is ${formatFileSize(MAX_SIZE)}.`);
      } else {
        setError(err?.message ?? "File rejected");
      }
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please select a file");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("displayName", displayName || file.name);
      formData.append("description", description);
      formData.append("category", category);
      if (matterId) formData.append("matterId", matterId);
      if (clientId) formData.append("clientId", clientId);
      formData.append("isConfidential", String(isConfidential));
      formData.append("allowClientView", String(allowClientView));

      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.message ?? "Upload failed");
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push(matterId ? `/cases/${matterId}` : "/documents"), 2000);
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  if (success) {
    return (
      <Card>
        <CardContent className="pt-6 flex flex-col items-center gap-3 text-center py-12">
          <CheckCircle className="h-12 w-12 text-green-500" />
          <h3 className="text-lg font-semibold">Document Uploaded</h3>
          <p className="text-muted-foreground text-sm">
            Encrypted and stored securely. Redirecting...
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Document</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Dropzone */}
          <div
            {...getRootProps()}
            className={cn(
              "flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors",
              isDragActive
                ? "border-primary bg-primary/5"
                : "border-input hover:border-primary hover:bg-muted/50"
            )}
          >
            <input {...getInputProps()} />
            {file ? (
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.size)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                  }}
                  className="ml-2 rounded-full p-1 hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {isDragActive
                    ? "Drop the file here"
                    : "Drag & drop or click to select"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Max {formatFileSize(MAX_SIZE)} · PDF, Word, Images
                </p>
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="displayName">Document Name *</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Settlement Agreement"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select defaultValue="OTHER" onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([val, label]) => (
                  <SelectItem key={val} value={val}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Matter</Label>
              <Select
                defaultValue={defaultMatterId ?? ""}
                onValueChange={setMatterId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select matter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {matters.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.matterNumber}: {m.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Client</Label>
              <Select
                defaultValue={defaultClientId ?? ""}
                onValueChange={setClientId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.firstName} {c.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this document..."
              rows={2}
            />
          </div>

          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={isConfidential}
                onChange={(e) => setIsConfidential(e.target.checked)}
                className="rounded border-input"
              />
              Confidential
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={allowClientView}
                onChange={(e) => setAllowClientView(e.target.checked)}
                className="rounded border-input"
              />
              Visible to client portal
            </label>
          </div>

          <Button type="submit" className="w-full" disabled={isUploading || !file}>
            {isUploading ? "Encrypting & uploading..." : "Upload Document"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
