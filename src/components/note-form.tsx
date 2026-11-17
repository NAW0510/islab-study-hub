"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { ActionResult, Note, SubjectRef, TopicRef } from "@/lib/types";
import { cn, todayISO } from "@/lib/utils";
import { ActionForm, SubmitButton } from "./action-form";
import { Markdown } from "./markdown";
import { SubjectTopicSelect } from "./subject-topic-select";

const PLACEHOLDER = `## Ringkasan
Tulis apa yang kamu pelajari hari ini…

## Poin penting
- Gradient descent memperbarui bobot ke arah negatif gradien
- Learning rate terlalu besar → tidak konvergen

## Rumus
$$
\\theta := \\theta - \\alpha \\nabla_\\theta J(\\theta)
$$

## Kode
\`\`\`python
from sklearn.linear_model import LinearRegression
\`\`\``;

export function NoteForm({
  note,
  subjects,
  topics,
  defaultSubjectId,
  defaultTopicId,
  action,
  cancelHref,
}: {
  note?: Note;
  subjects: SubjectRef[];
  topics: TopicRef[];
  defaultSubjectId?: string | null;
  defaultTopicId?: string | null;
  action: (formData: FormData) => Promise<ActionResult>;
  cancelHref: string;
}) {
  const [content, setContent] = useState(note?.content ?? "");
  const [tab, setTab] = useState<"write" | "preview">("write");
  const wrapperRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={wrapperRef}
      onKeyDown={(e) => {
        // Ctrl/Cmd + S saves the note.
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          wrapperRef.current?.querySelector("form")?.requestSubmit();
        }
      }}
    >
      <ActionForm action={action} className="space-y-5">
        <div>
          <label className="label" htmlFor="title">
            Judul
          </label>
          <input
            id="title"
            name="title"
            required
            maxLength={300}
            defaultValue={note?.title}
            placeholder="mis. Linear Regression & Gradient Descent"
            className="input text-base"
            autoFocus={!note}
          />
        </div>

        <SubjectTopicSelect
          subjects={subjects}
          topics={topics}
          defaultSubjectId={note?.subject_id ?? defaultSubjectId}
          defaultTopicId={note?.syllabus_item_id ?? defaultTopicId}
        />

        <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
          <div>
            <label className="label" htmlFor="learned_on">
              Tanggal belajar
            </label>
            <input
              id="learned_on"
              name="learned_on"
              type="date"
              defaultValue={note?.learned_on ?? todayISO()}
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="tags">
              Tag
            </label>
            <input
              id="tags"
              name="tags"
              defaultValue={note?.tags.join(", ")}
              placeholder="regression, supervised, sklearn"
              className="input"
            />
            <p className="hint">Pisahkan dengan koma.</p>
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="label mb-0" htmlFor="content">
              Isi catatan
            </label>
            <div className="segmented segmented-sm" role="tablist" aria-label="Mode editor">
              {(["write", "preview"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className="segmented-item"
                >
                  {t === "write" ? "Tulis" : "Pratinjau"}
                </button>
              ))}
            </div>
          </div>

          {/* Textarea stays mounted (hidden) during preview so its value is submitted. */}
          <textarea
            id="content"
            name="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={PLACEHOLDER}
            rows={20}
            className={cn("input min-h-80 resize-y font-mono text-[13px] leading-6", tab === "preview" && "hidden")}
          />
          {tab === "preview" && (
            <div className="card min-h-80 px-5 py-4">
              {content.trim() ? <Markdown content={content} /> : <p className="text-sm text-muted">Belum ada isi.</p>}
            </div>
          )}
          <p className="hint">
            Mendukung Markdown (judul, list, tabel, <code>```kode```</code>) dan rumus LaTeX:{" "}
            <code>$x^2$</code> atau <code>$$…$$</code>. Simpan cepat dengan Ctrl+S.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border pt-5">
          <Link href={cancelHref} className="btn btn-ghost">
            Batal
          </Link>
          <SubmitButton>{note ? "Simpan perubahan" : "Simpan catatan"}</SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
