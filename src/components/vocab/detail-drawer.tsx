"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Pencil, Trash2, X } from "lucide-react";
import { nearestTerms, updateTerm, type NearestTerm } from "@/lib/actions/vocab";
import { callAction } from "@/lib/call-action";
import type { SubjectRef, TopicRef, VocabDomain, VocabTerm } from "@/lib/types";
import { formatDate, todayISO } from "@/lib/utils";
import { confidenceLabel, DOMAIN_SOURCE_LABELS, type DomainIndex } from "@/lib/vocab/format";
import { weekMarker, weekNumberFor } from "@/lib/report-template";
import dynamic from "next/dynamic";
import { FormError } from "../action-form";
import { DomainChip } from "./domain-chip";
import { SubjectTopicFields } from "./subject-topic-fields";
import { TermDomains } from "./term-domains";

// The Markdown renderer (react-markdown + KaTeX) is heavy; load it only when a
// drawer actually opens so the /vocab page itself stays light.
const Markdown = dynamic(() => import("../markdown").then((m) => m.Markdown), {
  loading: () => <p className="text-sm text-muted">Memuat…</p>,
});

/** Right-hand sheet with the full term: definition, domain, neighbours, edit, delete. */
export function DetailDrawer({
  term,
  domains,
  domainList,
  subjects,
  topics,
  programStart,
  onClose,
  onChanged,
  onDelete,
  onPickTerm,
}: {
  term: VocabTerm;
  domains: DomainIndex;
  domainList: VocabDomain[];
  subjects: SubjectRef[];
  topics: TopicRef[];
  programStart: string;
  onClose: () => void;
  onChanged: () => void;
  onDelete: (term: VocabTerm) => void;
  onPickTerm: (id: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [neighbours, setNeighbours] = useState<NearestTerm[] | null>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  // The parent remounts this drawer per term (key={term.id}), so view state
  // starts fresh; only the neighbour fetch reacts to changes here.
  useEffect(() => {
    let alive = true;
    if (term.embedded_at) {
      callAction(() => nearestTerms(term.id)).then((r) => {
        if (alive && r && "terms" in r) setNeighbours(r.terms);
      });
    }
    return () => {
      alive = false;
    };
  }, [term.id, term.embedded_at, term.updated_at]);

  const domain = term.domain_id ? (domains.get(term.domain_id) ?? null) : null;
  const subject = subjects.find((s) => s.id === term.subject_id);
  const topic = topics.find((t) => t.id === term.syllabus_item_id);
  const week = weekNumberFor(programStart, term.learned_on);

  function saveEdit(formData: FormData) {
    startTransition(async () => {
      const result = await callAction(() => updateTerm(term.id, formData));
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      setEditing(false);
      setError(null);
      onChanged();
    });
  }

  return (
    <dialog
      ref={dialogRef}
      aria-label={`Detail istilah ${term.term}`}
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-[min(30rem,100vw)] max-w-none overflow-y-auto border-l border-border bg-surface p-0 text-text backdrop:bg-scrim"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && dialogRef.current?.close()}
    >
      <div className="flex min-h-full flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold tracking-tight break-words">{term.term}</h2>
            {term.aliases.length > 0 && <p className="mt-0.5 text-sm text-muted">alias: {term.aliases.join(", ")}</p>}
          </div>
          <form method="dialog">
            <button type="submit" className="icon-btn" aria-label="Tutup">
              <X className="size-4" />
            </button>
          </form>
        </div>

        {!editing ? (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
              {/* With a domain, the Domain section below lists them all. */}
              {!domain && <DomainChip domain={domain} domains={domains} />}
              <span>{DOMAIN_SOURCE_LABELS[term.domain_source]}</span>
              {(term.domain_source === "auto" || term.domain_source === "pending") && term.domain_scores && (
                <span>· Keyakinan: {confidenceLabel(term, domains)}</span>
              )}
              {!term.embedded_at && <span className="chip chip-tone tone-warn">Belum diproses</span>}
            </div>

            <TermDomains term={term} domains={domains} domainList={domainList} onChanged={onChanged} />

            <dl className="mt-4 grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted">Dipelajari</dt>
              <dd>
                {formatDate(term.learned_on)} · {weekMarker(week)}
              </dd>
              {subject && (
                <>
                  <dt className="text-muted">Subjek</dt>
                  <dd>{subject.title}</dd>
                </>
              )}
              {topic && (
                <>
                  <dt className="text-muted">Topik</dt>
                  <dd>{topic.title}</dd>
                </>
              )}
            </dl>

            <div className="mt-5 border-t border-border pt-4">
              {term.definition.trim() ? (
                <Markdown content={term.definition} />
              ) : (
                <p className="text-sm text-muted italic">Belum ada definisi. Tanpa definisi, klasifikasi jadi lemah.</p>
              )}
            </div>

            <div className="mt-6 border-t border-border pt-4">
              <h3 className="eyebrow mb-2 text-text">Istilah terdekat</h3>
              {!term.embedded_at ? (
                <p className="text-sm text-muted">Tersedia setelah istilah diproses.</p>
              ) : neighbours === null ? (
                <p className="text-sm text-muted">Memuat…</p>
              ) : neighbours.length === 0 ? (
                <p className="text-sm text-muted">Belum ada istilah lain yang bisa dibandingkan.</p>
              ) : (
                <ul className="space-y-1.5">
                  {neighbours.map((n) => (
                    <li key={n.id} className="flex items-center justify-between gap-3 text-sm">
                      <button type="button" className="truncate text-left hover:text-accent" onClick={() => onPickTerm(n.id)}>
                        {n.term}
                      </button>
                      <span className="shrink-0 text-xs text-muted tabular-nums" title="Kemiripan kosinus (bukan persen)">
                        {n.similarity.toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-4">
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
                <Pencil className="size-4" /> Edit
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  dialogRef.current?.close();
                  onDelete(term);
                }}
              >
                <Trash2 className="size-4" /> Hapus
              </button>
            </div>
          </>
        ) : (
          <form
            method="post"
            className="mt-4 flex flex-1 flex-col gap-3"
            aria-busy={pending}
            onSubmit={(e) => {
              e.preventDefault();
              saveEdit(new FormData(e.currentTarget));
            }}
          >
            <div>
              <label className="label" htmlFor="ed-term">
                Istilah
              </label>
              <input id="ed-term" name="term" defaultValue={term.term} required maxLength={120} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="ed-def">
                Definisi
              </label>
              <textarea id="ed-def" name="definition" defaultValue={term.definition} rows={6} className="input" />
              <p className="hint">Mengubah teks akan membuat istilah di-embed dan diklasifikasi ulang.</p>
            </div>
            <div>
              <label className="label" htmlFor="ed-aliases">
                Alias
              </label>
              <input id="ed-aliases" name="aliases" defaultValue={term.aliases.join(", ")} className="input" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="ed-learned">
                  Tanggal belajar
                </label>
                <input id="ed-learned" name="learned_on" type="date" defaultValue={term.learned_on ?? todayISO()} className="input" />
              </div>
              <div>
                <label className="label" htmlFor="ed-domain">
                  Domain utama
                </label>
                <select id="ed-domain" name="domain_id" defaultValue={term.domain_id ?? ""} className="input">
                  <option value="">— Tanpa domain (minta tebakan) —</option>
                  {domainList.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.parent_id ? "— " : ""}
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SubjectTopicFields
                subjects={subjects}
                topics={topics}
                initialSubjectId={term.subject_id ?? ""}
                initialTopicId={term.syllabus_item_id ?? ""}
              />
            </div>
            {error && <FormError message={error} />}
            <div className="mt-auto flex justify-end gap-2 border-t border-border pt-4">
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
                Batal
              </button>
              <button type="submit" disabled={pending} className="btn btn-primary">
                {pending && <Loader2 className="size-4 animate-spin" />}
                Simpan perubahan
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
