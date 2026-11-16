"use client";

import { useTransition } from "react";
import { Check, Loader2, Pencil } from "lucide-react";
import { confirmTermDomain, setTermDomain } from "@/lib/actions/vocab";
import { callAction } from "@/lib/call-action";
import type { VocabDomain, VocabTerm } from "@/lib/types";
import { confidenceLabel, type DomainIndex } from "@/lib/vocab/format";
import { DomainChip } from "./domain-chip";

/**
 * The domain line of one term row (spec §3.4):
 *   auto      → chip + "otomatis · keyakinan" + [Benar] [Ubah]
 *   pending   → up to three suggestion chips + [Lainnya…]
 *   confirmed/manual → chip + label
 *   no embedding yet → "Belum diproses"
 */
export function TermRowStatus({
  term,
  domains,
  suggestions,
  onOpen,
  onDone,
}: {
  term: VocabTerm;
  domains: DomainIndex;
  suggestions: VocabDomain[];
  onOpen: () => void;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const domain = term.domain_id ? (domains.get(term.domain_id) ?? null) : null;

  const run = (action: () => ReturnType<typeof confirmTermDomain>) =>
    startTransition(async () => {
      const result = await callAction(action);
      if (result?.error) window.alert(result.error);
      onDone();
    });

  if (!term.embedded_at && term.domain_source === "pending") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="chip chip-tone tone-warn">Belum diproses</span>
        <span>Klasifikasi gagal atau belum berjalan. Pakai “Proses yang tertunda”.</span>
      </div>
    );
  }

  if (term.domain_source === "pending") {
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        <span className="chip chip-tone tone-none">Menunggu domain</span>
        {suggestions.length > 0 && <span>Saran:</span>}
        {suggestions.map((d) => (
          <DomainChip key={d.id} domain={d} onClick={() => run(() => setTermDomain(term.id, d.id))} />
        ))}
        <button type="button" className="text-accent hover:text-accent-hover" onClick={onOpen}>
          Lainnya…
        </button>
        {pending && <Loader2 className="size-3.5 animate-spin" />}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
      <DomainChip domain={domain} domains={domains} />
      {term.domain_source === "auto" ? (
        <>
          <span>otomatis · keyakinan {confidenceLabel(term, domains).toLowerCase()}</span>
          <button
            type="button"
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-btn border border-border-strong px-2 py-0.5 font-medium text-text hover:bg-surface-2"
            onClick={() => run(() => confirmTermDomain(term.id))}
          >
            {pending ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />} Benar
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-btn border border-border px-2 py-0.5 hover:bg-surface-2 hover:text-text"
            onClick={onOpen}
          >
            <Pencil className="size-3" /> Ubah
          </button>
        </>
      ) : (
        <span>{term.domain_source === "confirmed" ? "dikonfirmasi" : "manual"}</span>
      )}
    </div>
  );
}
