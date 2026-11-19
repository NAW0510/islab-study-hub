"use client";

import Link from "next/link";
import { Plus, Search, X } from "lucide-react";
import type { ReactNode } from "react";
import type { SubjectRef } from "@/lib/types";
import { useUrlFilters } from "@/lib/use-url-filters";
import { cn, normalizeSearch } from "@/lib/utils";
import { EmptyState, PageHeader } from "./ui";

export type NoteItem = {
  id: string;
  subjectId: string | null;
  topicId: string | null;
  topicTitle: string | null;
  tags: string[];
  /** Lower-cased, accent-free title + tags + content, for instant search. */
  haystack: string;
  card: ReactNode;
};

type Filters = { q?: string; subject?: string; topic?: string; tag?: string };

export function NoteBrowser({
  items,
  subjects,
  initial,
}: {
  items: NoteItem[];
  subjects: SubjectRef[];
  initial: Filters;
}) {
  const { filters: f, update, reset } = useUrlFilters(initial);

  const terms = normalizeSearch(f.q ?? "").split(/\s+/).filter(Boolean);
  const visible = items.filter(
    (n) =>
      (!f.subject || n.subjectId === f.subject) &&
      (!f.topic || n.topicId === f.topic) &&
      (!f.tag || n.tags.includes(f.tag)) &&
      terms.every((t) => n.haystack.includes(t)),
  );
  const hasFilters = Boolean(f.q || f.subject || f.topic || f.tag);
  const topicTitle = f.topic ? items.find((n) => n.topicId === f.topic)?.topicTitle : null;

  const tagCounts = new Map<string, number>();
  for (const n of items) for (const tag of n.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24);

  const newParams = new URLSearchParams();
  if (f.subject) newParams.set("subject", f.subject);
  if (f.topic) newParams.set("topic", f.topic);
  const newHref = `/notes/new${newParams.size ? `?${newParams}` : ""}`;

  return (
    <>
      <PageHeader
        title="Catatan"
        description="Semua materi yang sudah kamu pelajari, dalam satu tempat."
        actions={
          <Link href={newHref} className="btn btn-ring h-11 px-5">
            <Plus className="size-4" /> Catatan baru
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2" role="search">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={f.q ?? ""}
            onChange={(e) => update({ q: e.target.value || undefined })}
            placeholder="Cari judul, isi, atau tag…"
            className="input pl-9"
            aria-label="Cari catatan"
          />
        </div>
        <select
          aria-label="Filter subjek"
          value={f.subject ?? ""}
          onChange={(e) => update({ subject: e.target.value || undefined })}
          className="input w-auto max-w-56"
        >
          <option value="">Semua subjek</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </div>

      {topTags.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-1.5" role="group" aria-label="Filter tag">
          {topTags.map(([tag, count]) => {
            const active = f.tag === tag;
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={active}
                onClick={() => update({ tag: active ? undefined : tag })}
                className={cn(
                  "chip transition",
                  active ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted hover:text-text",
                )}
              >
                #{tag}
                <span className="opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {hasFilters && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted">
          <span>
            {visible.length} catatan ditemukan
            {f.topic && (
              <>
                {" "}
                untuk topik <span className="font-medium text-text">{topicTitle ?? "ini"}</span>
              </>
            )}
          </span>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 text-accent hover:text-accent-hover"
          >
            <X className="size-3.5" /> Hapus filter
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          title={hasFilters ? "Tidak ada catatan yang cocok" : "Belum ada catatan"}
          shapes={[
            ["triangle", "red"],
            ["circle", "blue"],
            ["square", "yellow"],
          ]}
          description={
            hasFilters
              ? "Coba kata kunci lain atau hapus filter."
              : "Catat apa yang kamu pelajari hari ini — ringkasan, rumus, potongan kode."
          }
          action={
            !hasFilters && (
              <Link href="/notes/new" className="btn btn-primary">
                <Plus className="size-4" /> Tulis catatan
              </Link>
            )
          }
        />
      ) : (
        <div className="grid gap-3.5 md:grid-cols-2">
          {visible.map((n) => (
            <div key={n.id} className="grid">
              {n.card}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
