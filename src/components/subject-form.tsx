"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { createSubject, updateSubject } from "@/lib/actions/subjects";
import { SUBJECT_COLOR_KEYS, SUBJECT_COLORS } from "@/lib/constants";
import type { ActionResult, Subject } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "./action-form";

export function SubjectForm({
  subject,
  action,
  onDone,
  submitLabel,
}: {
  subject?: Subject;
  action: (formData: FormData) => Promise<ActionResult>;
  onDone?: () => void;
  submitLabel: string;
}) {
  return (
    <ActionForm action={action} onSuccess={onDone} className="space-y-4">
      <div>
        <label className="label" htmlFor="subject-title">
          Nama subjek
        </label>
        <input
          id="subject-title"
          name="title"
          required
          maxLength={200}
          defaultValue={subject?.title}
          placeholder="mis. Machine Learning, Statistika, Python untuk Data Science"
          className="input"
          autoFocus
        />
      </div>
      <div>
        <label className="label" htmlFor="subject-description">
          Deskripsi
        </label>
        <textarea
          id="subject-description"
          name="description"
          rows={2}
          defaultValue={subject?.description ?? ""}
          placeholder="Tujuan belajar, sumber silabus, mentor di IS Lab…"
          className="input resize-y"
        />
      </div>
      <fieldset>
        <legend className="label">Warna</legend>
        <div className="flex flex-wrap gap-2">
          {SUBJECT_COLOR_KEYS.map((key) => (
            <label key={key} className="cursor-pointer" title={SUBJECT_COLORS[key].label}>
              <input
                type="radio"
                name="color"
                value={key}
                defaultChecked={(subject?.color ?? "teal") === key}
                className="peer sr-only"
              />
              <span
                className={cn(
                  "block size-7 rounded-full ring-2 ring-transparent ring-offset-2 ring-offset-surface transition peer-checked:ring-text peer-focus-visible:ring-accent",
                  SUBJECT_COLORS[key].dot,
                )}
              />
              <span className="sr-only">{SUBJECT_COLORS[key].label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex justify-end gap-2">
        {onDone && (
          <button type="button" className="btn btn-ghost" onClick={onDone}>
            Batal
          </button>
        )}
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}

/** "New subject" / "Edit subject" button that expands into the form. */
export function SubjectFormPanel({ subject, defaultOpen = false }: { subject?: Subject; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  const trigger = subject ? (
    <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
      <Pencil className="size-4" /> Edit
    </button>
  ) : (
    <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
      <Plus className="size-4" /> Subjek baru
    </button>
  );

  if (!open) return trigger;

  return (
    <>
      {trigger}
      <div
        className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-16 backdrop-blur-[2px]"
        onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="subject-dialog-title"
          className="card w-full max-w-lg p-5 shadow-xl sm:p-6"
        >
          <h2 id="subject-dialog-title" className="mb-4 text-lg font-semibold">
            {subject ? "Edit subjek" : "Subjek baru"}
          </h2>
          <SubjectForm
            subject={subject}
            action={subject ? updateSubject.bind(null, subject.id) : createSubject}
            onDone={() => setOpen(false)}
            submitLabel={subject ? "Simpan" : "Buat subjek"}
          />
        </div>
      </div>
    </>
  );
}
