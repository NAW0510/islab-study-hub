"use client";

import { Plus, X } from "lucide-react";
import type { ReactNode } from "react";
import { RESOURCE_TYPE_LABELS, RESOURCE_TYPES, STATUS_META, STATUSES } from "@/lib/constants";
import type { ResourceType, Status, SubjectRef } from "@/lib/types";
import { useUrlFilters } from "@/lib/use-url-filters";
import { cn } from "@/lib/utils";
import { ListItemMotion } from "./motion";
import { ReturnToLink } from "./return-to-link";
import { EmptyState, PageHeader } from "./ui";

export type ResourceItem = {
  id: string;
  status: Status;
  type: ResourceType;
  subjectId: string | null;
  topicId: string | null;
  topicTitle: string | null;
  card: ReactNode;
};

type Filters = { status?: string; type?: string; subject?: string; topic?: string };

export function ResourceBrowser({
  items,
  subjects,
  initial,
}: {
  items: ResourceItem[];
  subjects: SubjectRef[];
  initial: Filters;
}) {
  const { filters: f, update, reset } = useUrlFilters(initial);

  const visible = items.filter(
    (i) =>
      (!f.status || i.status === f.status) &&
      (!f.type || i.type === f.type) &&
      (!f.subject || i.subjectId === f.subject) &&
      (!f.topic || i.topicId === f.topic),
  );
  const hasFilters = Boolean(f.status || f.type || f.subject || f.topic);
  const topicTitle = f.topic ? items.find((i) => i.topicId === f.topic)?.topicTitle : null;

  const newParams = new URLSearchParams();
  if (f.subject) newParams.set("subject", f.subject);
  if (f.topic) newParams.set("topic", f.topic);
  const newHref = `/resources/new${newParams.size ? `?${newParams}` : ""}`;

  const addButton = (
    <ReturnToLink href={newHref} className="btn btn-ring h-11 px-5">
      <Plus className="size-4" /> Tambah sumber
    </ReturnToLink>
  );

  return (
    <>
      <PageHeader
        title="Sumber Belajar"
        description="Video YouTube, dokumen, artikel, dan kursus yang kamu perlukan."
        actions={addButton}
      />

      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter status">
          {[undefined, ...STATUSES].map((s) => {
            const active = f.status === s;
            const count = s ? items.filter((i) => i.status === s).length : items.length;
            return (
              <button
                key={s ?? "all"}
                type="button"
                aria-pressed={active}
                onClick={() => update({ status: s })}
                className={cn(
                  "chip px-3 py-1 text-sm transition",
                  active ? "bg-text text-bg" : "bg-surface-2 text-muted hover:text-text",
                )}
              >
                {s ? STATUS_META[s].label : "Semua"}
                <span className="opacity-60 tabular-nums">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Filter jenis"
            value={f.type ?? ""}
            onChange={(e) => update({ type: e.target.value || undefined })}
            className="input w-auto max-w-56"
          >
            <option value="">Semua jenis</option>
            {RESOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {RESOURCE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
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
      </div>

      {hasFilters && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted">
          <span>
            {visible.length} sumber
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
          shapes={[
            ["half", "blue"],
            ["square", "green"],
            ["circle", "red"],
          ]}
          title={hasFilters ? "Tidak ada sumber yang cocok" : "Belum ada sumber belajar"}
          description={
            hasFilters
              ? "Coba ubah atau hapus filter."
              : "Simpan link YouTube, PDF materi dari IS Lab, artikel, atau kursus online."
          }
          action={!hasFilters && addButton}
        />
      ) : (
        <div className="space-y-3.5">
          {visible.map((i) => (
            // A deleted resource fades and the rest glide up.
            <ListItemMotion key={i.id}>
              <div>{i.card}</div>
            </ListItemMotion>
          ))}
        </div>
      )}
    </>
  );
}
