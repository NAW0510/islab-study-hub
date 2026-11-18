"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { addTermDomain, makePrimaryDomain, removeTermDomain } from "@/lib/actions/vocab";
import { callAction } from "@/lib/call-action";
import type { ActionResult, VocabDomain, VocabTerm } from "@/lib/types";
import { domainPath, extraDomainIds, termDomainIds, type DomainIndex } from "@/lib/vocab/format";
import { alsoFits } from "../../../supabase/functions/_shared/vocab-classify.ts";
import { DomainChip } from "./domain-chip";

/**
 * Every domain of a term (one term, many domains), in the detail drawer: the
 * primary one, the extras (each can become the primary one or come off), a
 * picker for one more, and the "Juga cocok di" suggestions.
 */
export function TermDomains({
  term,
  domains,
  domainList,
  onChanged,
}: {
  term: VocabTerm;
  domains: DomainIndex;
  domainList: VocabDomain[];
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState("");
  if (!term.domain_id) return null;

  const primary = domains.get(term.domain_id) ?? null;
  const extras = extraDomainIds(term)
    .map((id) => domains.get(id))
    .filter((d): d is VocabDomain => Boolean(d));
  const assigned = termDomainIds(term);
  const fits = alsoFits(term.domain_scores, assigned, (id) => domains.get(id)?.parent_id)
    .map((id) => domains.get(id))
    .filter((d): d is VocabDomain => Boolean(d));
  const addable = domainList.filter((d) => !assigned.includes(d.id));

  const run = (action: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const result = await callAction(action);
      if (result?.error) window.alert(result.error);
      onChanged();
    });

  return (
    <section className="mt-4 rounded-card border border-border p-3.5" aria-labelledby="domain-istilah">
      <h3 id="domain-istilah" className="eyebrow mb-2.5 text-text">
        Domain {extras.length > 0 && <span className="font-normal normal-case tracking-normal text-muted">· {extras.length + 1} domain</span>}
        {pending && <Loader2 className="size-3.5 animate-spin" />}
      </h3>
      <ul className="space-y-2">
        <li className="flex flex-wrap items-center gap-2">
          <DomainChip domain={primary} domains={domains} />
          <span className="text-xs text-muted">utama</span>
        </li>
        {extras.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-2">
            <DomainChip domain={d} domains={domains} />
            <button
              type="button"
              disabled={pending}
              className="text-xs font-medium text-accent hover:text-accent-hover"
              onClick={() => run(() => makePrimaryDomain(term.id, d.id))}
            >
              Jadikan utama
            </button>
            <button
              type="button"
              disabled={pending}
              className="icon-btn size-7"
              aria-label={`Lepas ${d.name} dari istilah ini`}
              title="Lepas domain ini"
              onClick={() => run(() => removeTermDomain(term.id, d.id))}
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>

      {fits.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <span>Juga cocok di:</span>
          {fits.map((d) => (
            <button
              key={d.id}
              type="button"
              disabled={pending}
              onClick={() => run(() => addTermDomain(term.id, d.id))}
              className="inline-flex items-center gap-1 rounded-btn border border-dashed border-border-strong px-2 py-0.5 font-medium text-text hover:bg-surface-2"
            >
              <Plus className="size-3" /> {d.name}
            </button>
          ))}
        </div>
      )}

      {addable.length > 0 && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!adding) return;
            const id = adding;
            setAdding("");
            run(() => addTermDomain(term.id, id));
          }}
        >
          <select value={adding} onChange={(e) => setAdding(e.target.value)} className="input min-h-9 flex-1 py-1.5 text-sm" aria-label="Tambah domain lain">
            <option value="">Tambah domain lain…</option>
            {addable.map((d) => (
              <option key={d.id} value={d.id}>
                {domainPath(d.id, domains)}
              </option>
            ))}
          </select>
          <button type="submit" disabled={!adding || pending} className="btn btn-secondary btn-sm">
            <Plus className="size-4" /> Tambah
          </button>
        </form>
      )}
    </section>
  );
}
