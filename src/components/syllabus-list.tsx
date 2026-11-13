"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, CalendarDays, Library, ListPlus, NotebookPen, Pencil, Plus } from "lucide-react";
import {
  addSyllabusItems,
  deleteSyllabusItem,
  moveSyllabusItem,
  setSyllabusStatus,
  updateSyllabusItem,
} from "@/lib/actions/syllabus";
import { callAction } from "@/lib/call-action";
import type { SyllabusItem } from "@/lib/types";
import { cn, daysFromToday, formatDate } from "@/lib/utils";
import { DeleteButton, StatusCheck, StatusSelect } from "./action-buttons";
import { ActionForm, SubmitButton } from "./action-form";

type Counts = Record<string, { notes: number; resources: number }>;

export function SyllabusList({
  subjectId,
  items,
  counts,
}: {
  subjectId: string;
  items: SyllabusItem[];
  counts: Counts;
}) {
  // Reordering updates the list instantly; the server catches up in the background.
  const [ordered, applyMove] = useOptimistic(items, (state, move: { id: string; direction: "up" | "down" }) => {
    const next = [...state];
    const from = next.findIndex((i) => i.id === move.id);
    const to = move.direction === "up" ? from - 1 : from + 1;
    if (from < 0 || to < 0 || to >= next.length) return state;
    [next[from], next[to]] = [next[to], next[from]];
    return next;
  });
  const [, startTransition] = useTransition();

  function move(id: string, direction: "up" | "down") {
    startTransition(async () => {
      applyMove({ id, direction });
      const result = await callAction(() => moveSyllabusItem(id, subjectId, direction));
      if (result?.error) window.alert(result.error);
    });
  }

  return (
    <div className="space-y-4">
      {ordered.length > 0 && (
        <ol className="card divide-y divide-border">
          {ordered.map((item, index) => (
            <SyllabusRow
              key={item.id}
              item={item}
              index={index}
              isFirst={index === 0}
              isLast={index === ordered.length - 1}
              counts={counts[item.id]}
              onMove={(direction) => move(item.id, direction)}
            />
          ))}
        </ol>
      )}
      <AddTopics subjectId={subjectId} startOpen={items.length === 0} />
    </div>
  );
}

function SyllabusRow({
  item,
  index,
  isFirst,
  isLast,
  counts,
  onMove,
}: {
  item: SyllabusItem;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  counts?: { notes: number; resources: number };
  onMove: (direction: "up" | "down") => void;
}) {
  const [editing, setEditing] = useState(false);
  const done = item.status === "completed";
  const dueIn = item.target_date ? daysFromToday(item.target_date) : null;
  const overdue = dueIn !== null && dueIn < 0 && !done;

  if (editing) {
    return (
      <li className="p-4">
        <ActionForm
          action={updateSyllabusItem.bind(null, item.id)}
          onSuccess={() => setEditing(false)}
          className="grid gap-3 sm:grid-cols-[1fr_11rem]"
        >
          <input name="title" defaultValue={item.title} required className="input" aria-label="Judul topik" autoFocus />
          <input
            name="target_date"
            type="date"
            defaultValue={item.target_date ?? ""}
            className="input"
            aria-label="Target selesai"
          />
          <textarea
            name="description"
            defaultValue={item.description ?? ""}
            rows={2}
            placeholder="Deskripsi / sub-topik (opsional)"
            className="input resize-y sm:col-span-2"
          />
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
              Batal
            </button>
            <SubmitButton className="btn-sm">Simpan</SubmitButton>
          </div>
        </ActionForm>
      </li>
    );
  }

  return (
    <li className="group flex gap-3 px-4 py-3.5">
      <StatusCheck
        value={item.status}
        action={setSyllabusStatus.bind(null, item.id)}
        label={`Selesai: ${item.title}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-muted tabular-nums">{index + 1}.</span>
          <span className={cn("min-w-0 font-medium", done && "text-muted line-through decoration-muted/50")}>
            {item.title}
          </span>
        </div>
        {item.description && <p className="mt-0.5 text-sm whitespace-pre-line text-muted">{item.description}</p>}

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
          <StatusSelect value={item.status} action={setSyllabusStatus.bind(null, item.id)} />
          {item.target_date && (
            <span className={cn("inline-flex items-center gap-1", overdue && "font-medium text-danger")}>
              <CalendarDays className="size-3.5" />
              {formatDate(item.target_date, { withYear: false })}
              {overdue && " · terlambat"}
            </span>
          )}
          {done && item.completed_at && <span>Selesai {formatDate(item.completed_at, { withYear: false })}</span>}
          <Link href={`/notes?topic=${item.id}`} className="inline-flex items-center gap-1 hover:text-text">
            <NotebookPen className="size-3.5" />
            {counts?.notes ?? 0} catatan
          </Link>
          <Link href={`/resources?topic=${item.id}`} className="inline-flex items-center gap-1 hover:text-text">
            <Library className="size-3.5" />
            {counts?.resources ?? 0} sumber
          </Link>
          <Link
            href={`/notes/new?subject=${item.subject_id}&topic=${item.id}`}
            className="inline-flex items-center gap-1 font-medium text-accent hover:text-accent-hover"
          >
            <Plus className="size-3.5" />
            Catatan
          </Link>

          <span className="ml-auto flex items-center gap-0.5 transition sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
            <button
              type="button"
              className="icon-btn size-7"
              title="Naikkan"
              aria-label="Naikkan"
              disabled={isFirst}
              onClick={() => onMove("up")}
            >
              <ArrowUp className="size-4" />
            </button>
            <button
              type="button"
              className="icon-btn size-7"
              title="Turunkan"
              aria-label="Turunkan"
              disabled={isLast}
              onClick={() => onMove("down")}
            >
              <ArrowDown className="size-4" />
            </button>
            <button
              type="button"
              className="icon-btn size-7"
              title="Edit"
              aria-label="Edit"
              onClick={() => setEditing(true)}
            >
              <Pencil className="size-4" />
            </button>
            <DeleteButton
              iconOnly
              className="size-7"
              action={deleteSyllabusItem.bind(null, item.id)}
              confirmText={`Hapus topik "${item.title}"? Catatan & sumber yang terhubung tidak ikut terhapus.`}
            />
          </span>
        </div>
      </div>
    </li>
  );
}

function AddTopics({ subjectId, startOpen }: { subjectId: string; startOpen: boolean }) {
  const [mode, setMode] = useState<"closed" | "single" | "bulk">(startOpen ? "bulk" : "closed");

  if (mode === "closed") {
    return (
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary" onClick={() => setMode("single")}>
          <Plus className="size-4" /> Tambah topik
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setMode("bulk")}>
          <ListPlus className="size-4" /> Tempel banyak topik
        </button>
      </div>
    );
  }

  const action = addSyllabusItems.bind(null, subjectId);

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">
          {mode === "bulk" ? "Tempel silabus (satu topik per baris)" : "Topik baru"}
        </h3>
        <button
          type="button"
          className="text-xs font-medium text-accent hover:text-accent-hover"
          onClick={() => setMode(mode === "bulk" ? "single" : "bulk")}
        >
          {mode === "bulk" ? "Tambah satu per satu" : "Tempel banyak sekaligus"}
        </button>
      </div>

      {mode === "bulk" ? (
        <ActionForm action={action} resetOnSuccess onSuccess={() => setMode("closed")} className="space-y-3">
          <textarea
            name="lines"
            required
            rows={8}
            autoFocus={!startOpen}
            className="input resize-y font-mono text-[13px] leading-6"
            placeholder={"1. Introduction to Machine Learning\n2. Linear Regression\n3. Logistic Regression\n4. Decision Tree & Random Forest\n5. Evaluasi model (precision, recall, F1)"}
          />
          <p className="hint">Nomor atau bullet di awal baris (1., -, *) akan dihapus otomatis.</p>
          <div className="flex justify-end gap-2">
            {!startOpen && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode("closed")}>
                Tutup
              </button>
            )}
            <SubmitButton className="btn-sm">Tambahkan ke silabus</SubmitButton>
          </div>
        </ActionForm>
      ) : (
        <ActionForm action={action} resetOnSuccess className="grid gap-3 sm:grid-cols-[1fr_11rem]">
          <input name="title" required placeholder="Judul topik" className="input" autoFocus aria-label="Judul topik" />
          <input name="target_date" type="date" className="input" aria-label="Target selesai" title="Target selesai" />
          <textarea
            name="description"
            rows={2}
            placeholder="Deskripsi / sub-topik (opsional)"
            className="input resize-y sm:col-span-2"
          />
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode("closed")}>
              Tutup
            </button>
            <SubmitButton className="btn-sm">Tambah topik</SubmitButton>
          </div>
        </ActionForm>
      )}
    </div>
  );
}
