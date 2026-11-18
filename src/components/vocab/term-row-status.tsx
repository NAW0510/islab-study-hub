"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Pencil, Plus } from "lucide-react";
import { addTermDomain, assignTermDomains, confirmTermDomain } from "@/lib/actions/vocab";
import { callAction } from "@/lib/call-action";
import type { ActionResult, VocabDomain, VocabTerm } from "@/lib/types";
import { cn } from "@/lib/utils";
import { confidenceLabel, extraDomainIds, termDomainIds, type DomainIndex } from "@/lib/vocab/format";
import { asDomainColor, DOMAIN_TONE_CLASS } from "@/lib/vocab/seed-domains";
import { alsoFits } from "../../../supabase/functions/_shared/vocab-classify.ts";
import { DomainChip } from "./domain-chip";

/**
 * The domain line of one term row (spec §3.4), for one term in many domains:
 *   auto      → chips + "otomatis · keyakinan" + [Benar] [Ubah]
 *   pending   → suggestion chips to tick (one or more; the first ticked is
 *               the primary domain) + [Pasang] + [Lainnya…]
 *   confirmed/manual → chips + label
 *   any assigned term → "Juga cocok di …" when other domains fit as well
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
  const [picked, setPicked] = useState<string[]>([]);
  const domain = term.domain_id ? (domains.get(term.domain_id) ?? null) : null;
  const extras = extraDomainIds(term)
    .map((id) => domains.get(id))
    .filter((d): d is VocabDomain => Boolean(d));
  const fits = term.domain_id
    ? alsoFits(term.domain_scores, termDomainIds(term), (id) => domains.get(id)?.parent_id)
        .map((id) => domains.get(id))
        .filter((d): d is VocabDomain => Boolean(d))
    : [];

  const run = (action: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const result = await callAction(action);
      if (result?.error) window.alert(result.error);
      setPicked([]);
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
    const toggle = (id: string) => setPicked((now) => (now.includes(id) ? now.filter((p) => p !== id) : [...now, id]));
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        <span className="chip chip-tone tone-none">Menunggu domain</span>
        {suggestions.length > 0 && <span>Pilih satu atau lebih:</span>}
        {suggestions.map((d) => {
          const order = picked.indexOf(d.id);
          return (
            <button
              key={d.id}
              type="button"
              aria-pressed={order >= 0}
              title={order === 0 ? `${d.name} (domain utama)` : d.name}
              onClick={() => toggle(d.id)}
              className={cn(
                "chip chip-tone cursor-pointer border",
                DOMAIN_TONE_CLASS[asDomainColor(d.color)],
                order >= 0 ? "border-text" : "border-transparent opacity-80 hover:opacity-100",
              )}
            >
              {d.name}
              {order === 0 && <span className="text-[10px] font-semibold tracking-wide uppercase">utama</span>}
              {order > 0 && <Check className="size-3" aria-hidden="true" />}
            </button>
          );
        })}
        {picked.length > 0 && (
          <button
            type="button"
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-btn bg-primary px-2.5 py-1 font-medium text-primary-fg hover:bg-primary-hover"
            onClick={() => run(() => assignTermDomains(term.id, picked))}
          >
            {pending ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
            Pasang{picked.length > 1 ? ` ${picked.length} domain` : ""}
          </button>
        )}
        <button type="button" className="text-accent hover:text-accent-hover" onClick={onOpen}>
          Lainnya…
        </button>
        {pending && picked.length === 0 && <Loader2 className="size-3.5 animate-spin" />}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        <DomainChip domain={domain} domains={domains} />
        {extras.map((d) => (
          <DomainChip key={d.id} domain={d} domains={domains} />
        ))}
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
      {fits.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <span>Juga cocok di:</span>
          {fits.map((d) => (
            <button
              key={d.id}
              type="button"
              disabled={pending}
              onClick={() => run(() => addTermDomain(term.id, d.id))}
              title={`Tambahkan ${d.name} sebagai domain tambahan`}
              className="inline-flex items-center gap-1 rounded-btn border border-dashed border-border-strong px-2 py-0.5 font-medium text-text hover:bg-surface-2"
            >
              <Plus className="size-3" /> {d.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
