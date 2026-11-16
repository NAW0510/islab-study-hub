"use client";

import { useRef, useState, useTransition } from "react";
import { ChevronDown, Loader2, Plus } from "lucide-react";
import { createTerm, type SaveTermResult } from "@/lib/actions/vocab";
import { callAction } from "@/lib/call-action";
import type { SubjectRef, TopicRef, VocabDomain, VocabTerm } from "@/lib/types";
import { cn, todayISO } from "@/lib/utils";
import { FormError } from "../action-form";
import { SubjectTopicFields } from "./subject-topic-fields";

/** Add one term fast: term + definition, details behind a disclosure. Ctrl/Cmd+Enter saves. */
export function QuickAdd({
  domains,
  subjects,
  topics,
  existing,
  onSaved,
}: {
  domains: VocabDomain[];
  subjects: SubjectRef[];
  topics: TopicRef[];
  /** Lower-cased terms and aliases already saved, for the duplicate warning. */
  existing: Map<string, VocabTerm>;
  onSaved: (result: Extract<SaveTermResult, { term: VocabTerm }>) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [more, setMore] = useState(false);

  const duplicate = existing.get(term.trim().toLowerCase());

  function submit() {
    const form = formRef.current;
    if (!form || pending) return;
    const formData = new FormData(form);
    startTransition(async () => {
      const result = await callAction(() => createTerm(formData));
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      setError(null);
      form.reset();
      setTerm("");
      if (result) onSaved(result);
    });
  }

  return (
    <form
      ref={formRef}
      method="post"
      className="card p-4"
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          submit();
        }
      }}
    >
      <div className="flex flex-wrap gap-2">
        <div className="min-w-44 flex-1">
          <input
            name="term"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Istilah, mis. backpropagation"
            aria-label="Istilah"
            required
            maxLength={120}
            className="input"
          />
        </div>
        <div className="min-w-56 flex-[2]">
          <textarea
            name="definition"
            rows={1}
            placeholder="Definisi (Markdown + LaTeX) — tulis dengan katamu sendiri"
            aria-label="Definisi"
            className="input min-h-10"
          />
        </div>
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Simpan istilah
        </button>
      </div>

      {duplicate && (
        <p className="mt-2 text-sm text-danger">
          “{duplicate.term}” sudah ada di Kosakata. Untuk homonim, beri kualifikasi: mis. “Kernel (SVM)”.
        </p>
      )}
      {pending && (
        <p className="mt-2 text-sm text-muted" role="status">
          Menyimpan, lalu mengklasifikasi…
        </p>
      )}
      {error && <FormError message={error} />}

      <button
        type="button"
        className="mt-3 inline-flex items-center gap-1 text-sm text-muted hover:text-text"
        aria-expanded={more}
        onClick={() => setMore((v) => !v)}
      >
        <ChevronDown className={cn("size-4 transition-transform", more && "rotate-180")} />
        Detail lain (alias, tanggal, kaitan, domain)
      </button>

      <div className={cn("mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4", !more && "hidden")}>
        <div>
          <label className="label" htmlFor="qa-aliases">
            Alias
          </label>
          <input id="qa-aliases" name="aliases" placeholder="mis. SGD, stochastic GD" className="input" />
          <p className="hint">Pisahkan dengan koma; ikut dipakai saat klasifikasi.</p>
        </div>
        <div>
          <label className="label" htmlFor="qa-learned">
            Tanggal belajar
          </label>
          <input id="qa-learned" name="learned_on" type="date" defaultValue={todayISO()} className="input" />
        </div>
        <SubjectTopicFields subjects={subjects} topics={topics} />
        <div>
          <label className="label" htmlFor="qa-domain">
            Domain (manual)
          </label>
          <select id="qa-domain" name="domain_id" defaultValue="" className="input">
            <option value="">— Biarkan sistem menebak —</option>
            {domains.map((d) => (
              <option key={d.id} value={d.id}>
                {d.parent_id ? "— " : ""}
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </form>
  );
}
