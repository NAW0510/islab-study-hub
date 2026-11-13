"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { FileUp, Link2, Loader2 } from "lucide-react";
import { discardUpload } from "@/lib/actions/resources";
import { DOCUMENTS_BUCKET, RESOURCE_TYPE_LABELS, RESOURCE_TYPES, STATUS_META, STATUSES } from "@/lib/constants";
import { callAction } from "@/lib/call-action";
import { createClient } from "@/lib/supabase/client";
import type { ActionResult, Resource, ResourceType, SubjectRef, TopicRef } from "@/lib/types";
import { cn, getYouTubeId, guessResourceType } from "@/lib/utils";
import { FormError } from "./action-form";
import { SubjectTopicSelect } from "./subject-topic-select";

const MAX_FILE_MB = 50;

function safeFileName(name: string) {
  return name.normalize("NFKD").replace(/[^\w.-]+/g, "_").slice(-100) || "file";
}

export function ResourceForm({
  resource,
  subjects,
  topics,
  defaultSubjectId,
  defaultTopicId,
  userId,
  action,
  returnTo,
}: {
  resource?: Resource;
  subjects: SubjectRef[];
  topics: TopicRef[];
  defaultSubjectId?: string | null;
  defaultTopicId?: string | null;
  userId: string;
  action: (formData: FormData) => Promise<ActionResult>;
  returnTo: string;
}) {
  const [mode, setMode] = useState<"link" | "file">(resource?.storage_path ? "file" : "link");
  const [url, setUrl] = useState(resource?.url ?? "");
  const [type, setType] = useState<ResourceType | "">(resource?.type ?? "");
  const [typeTouched, setTypeTouched] = useState(Boolean(resource));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);

  const youTubeId = mode === "link" ? getYouTubeId(url) : null;
  const existingFileName = resource?.storage_path?.split("/").pop()?.replace(/^[\w-]{36}-/, "");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const file = formData.get("file");
    formData.delete("file"); // never send file bytes through the server action

    startTransition(async () => {
      setError(null);
      let uploadedPath: string | null = null;

      if (mode === "file") {
        formData.delete("url");
        if (file instanceof File && file.size > 0) {
          if (file.size > MAX_FILE_MB * 1024 * 1024) {
            setError(`Ukuran file maksimal ${MAX_FILE_MB} MB.`);
            return;
          }
          setUploading(true);
          const path = `${userId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
          const { error: uploadError } = await createClient()
            .storage.from(DOCUMENTS_BUCKET)
            .upload(path, file, { contentType: file.type || undefined });
          setUploading(false);
          if (uploadError) {
            setError(`Upload gagal: ${uploadError.message}`);
            return;
          }
          uploadedPath = path;
          formData.set("storage_path", path);
          if (!String(formData.get("title") ?? "").trim()) {
            formData.set("title", file.name.replace(/\.[^.]+$/, ""));
          }
        } else if (resource?.storage_path) {
          formData.set("storage_path", resource.storage_path);
        } else {
          setError("Pilih file yang akan di-upload.");
          return;
        }
      } else {
        formData.delete("storage_path");
      }

      const result = await callAction(() => action(formData));
      if (result?.error) {
        if (uploadedPath) await discardUpload(uploadedPath).catch(() => undefined);
        setError(result.error);
      }
    });
  }

  const busy = pending || uploading;

  return (
    <form method="post" onSubmit={handleSubmit} className="space-y-5" aria-busy={busy}>
      <input type="hidden" name="return_to" value={returnTo} />

      <div>
        <span className="label">Sumber</span>
        <div className="mb-3 inline-flex rounded-lg bg-surface-2 p-0.5 text-sm font-medium">
          {(
            [
              ["link", "Link", Link2],
              ["file", "Upload file", FileUp],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition",
                mode === value ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text",
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>

        {mode === "link" ? (
          <div key="link">
            <input
              name="url"
              type="url"
              required
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (!typeTouched && e.target.value) setType(guessResourceType(e.target.value));
              }}
              placeholder="https://www.youtube.com/watch?v=… atau link dokumen/artikel"
              className="input"
              aria-label="Link"
            />
            {youTubeId && (
              <Image
                src={`https://i.ytimg.com/vi/${youTubeId}/mqdefault.jpg`}
                alt="Thumbnail video"
                width={240}
                height={135}
                className="mt-3 rounded-lg border border-border"
              />
            )}
          </div>
        ) : (
          <div key="file">
            <input
              name="file"
              type="file"
              accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md,.ipynb,.zip,image/*"
              className="input file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1 file:text-sm file:text-text"
            />
            <p className="hint">
              {existingFileName
                ? `File saat ini: ${existingFileName}. Pilih file baru untuk menggantinya.`
                : `PDF, slide, notebook, dll. Maksimal ${MAX_FILE_MB} MB.`}
            </p>
          </div>
        )}
      </div>

      <div>
        <label className="label" htmlFor="title">
          Judul
        </label>
        <input
          id="title"
          name="title"
          maxLength={300}
          defaultValue={resource?.title}
          placeholder="Kosongkan untuk mengambil judul otomatis (YouTube)"
          className="input"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="type">
            Jenis
          </label>
          <select
            id="type"
            name="type"
            className="input"
            value={type}
            onChange={(e) => {
              setType(e.target.value as ResourceType);
              setTypeTouched(true);
            }}
          >
            <option value="">Otomatis</option>
            {RESOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {RESOURCE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="status">
            Status
          </label>
          <select id="status" name="status" className="input" defaultValue={resource?.status ?? "not_started"}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <SubjectTopicSelect
        subjects={subjects}
        topics={topics}
        defaultSubjectId={resource?.subject_id ?? defaultSubjectId}
        defaultTopicId={resource?.syllabus_item_id ?? defaultTopicId}
      />

      <div>
        <label className="label" htmlFor="notes">
          Catatan singkat
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={resource?.notes ?? ""}
          placeholder="mis. tonton menit 12:30 untuk bagian backpropagation"
          className="input resize-y"
        />
      </div>

      {error && <FormError message={error} />}

      <div className="flex items-center justify-end gap-2 border-t border-border pt-5">
        <Link href={returnTo} className="btn btn-ghost">
          Batal
        </Link>
        <button type="submit" disabled={busy} className="btn btn-primary">
          {busy && <Loader2 className="size-4 animate-spin" />}
          {uploading ? "Mengupload…" : resource ? "Simpan perubahan" : "Simpan sumber"}
        </button>
      </div>
    </form>
  );
}
