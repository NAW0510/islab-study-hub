"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
import { termDetail, type NearestTerm } from "@/lib/actions/vocab";
import { callAction } from "@/lib/call-action";
import { weekMarker, weekNumberFor } from "@/lib/report-template";
import type { VocabTerm } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { DOMAIN_SOURCE_LABELS, extraDomainIds, type DomainIndex } from "@/lib/vocab/format";
import { DomainChip } from "../domain-chip";

const Markdown = dynamic(() => import("../../markdown").then((m) => m.Markdown), {
  loading: () => <p className="text-sm text-muted">Memuat…</p>,
});

type Detail = { term: VocabTerm; neighbours: NearestTerm[] };

/**
 * Selected term on the map: a right-hand panel on desktop, a bottom sheet on
 * phones. The neighbour scores come from the real embeddings, not from
 * distances on the 2D map.
 */
export function MapDetailPanel({
  termId,
  fallbackTitle,
  domains,
  programStart,
  onClose,
  onPick,
  onNeighbours,
}: {
  termId: string;
  fallbackTitle: string;
  domains: DomainIndex;
  programStart: string;
  onClose: () => void;
  onPick: (id: string) => void;
  /** Lets the map draw lines to the neighbours once they are known. */
  onNeighbours: (termId: string, neighbours: NearestTerm[]) => void;
}) {
  const [loaded, setLoaded] = useState<{ id: string; detail: Detail } | { id: string; error: string } | null>(null);

  useEffect(() => {
    let alive = true;
    callAction(() => termDetail(termId)).then((result) => {
      if (!alive || !result) return;
      if ("error" in result) setLoaded({ id: termId, error: result.error });
      else {
        setLoaded({ id: termId, detail: result });
        onNeighbours(termId, result.neighbours);
      }
    });
    return () => {
      alive = false;
    };
  }, [termId, onNeighbours]);

  const current = loaded?.id === termId ? loaded : null;
  const detail = current && "detail" in current ? current.detail : null;
  const term = detail?.term;
  const domain = term?.domain_id ? (domains.get(term.domain_id) ?? null) : null;

  return (
    <aside
      aria-label={`Detail istilah ${term?.term ?? fallbackTitle}`}
      className="absolute inset-x-0 bottom-0 z-10 flex max-h-[62%] flex-col overflow-y-auto rounded-t-panel border-t border-border bg-surface p-4 shadow-lg md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-80 md:rounded-none md:border-t-0 md:border-l md:shadow-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold tracking-tight break-words">{term?.term ?? fallbackTitle}</h2>
          {term && term.aliases.length > 0 && <p className="mt-0.5 text-xs text-muted">alias: {term.aliases.join(", ")}</p>}
        </div>
        <button type="button" className="icon-btn" aria-label="Tutup detail" onClick={onClose}>
          <X className="size-4" />
        </button>
      </div>

      {!current ? (
        <p className="mt-4 text-sm text-muted">Memuat…</p>
      ) : "error" in current ? (
        <p className="mt-4 text-sm text-danger">{current.error}</p>
      ) : (
        term && (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              <DomainChip domain={domain} domains={domains} />
              {extraDomainIds(term).map((id) => (
                <DomainChip key={id} domain={domains.get(id) ?? null} domains={domains} />
              ))}
              <span>{DOMAIN_SOURCE_LABELS[term.domain_source]}</span>
            </div>
            <p className="mt-2 text-xs text-muted">
              Dipelajari {formatDate(term.learned_on)} · {weekMarker(weekNumberFor(programStart, term.learned_on))}
            </p>

            <div className="mt-3 border-t border-border pt-3">
              {term.definition.trim() ? (
                <Markdown content={term.definition} />
              ) : (
                <p className="text-sm text-muted italic">Belum ada definisi.</p>
              )}
            </div>

            <div className="mt-4 border-t border-border pt-3">
              <h3 className="eyebrow mb-2 text-text">Istilah terdekat</h3>
              {detail.neighbours.length === 0 ? (
                <p className="text-sm text-muted">Belum ada istilah lain yang bisa dibandingkan.</p>
              ) : (
                <ul className="space-y-1.5">
                  {detail.neighbours.map((n) => (
                    <li key={n.id} className="flex items-center justify-between gap-3 text-sm">
                      <button type="button" className="truncate text-left hover:text-accent" onClick={() => onPick(n.id)}>
                        {n.term}
                      </button>
                      <span className="shrink-0 text-xs text-muted tabular-nums" title="Kemiripan kosinus dari embedding asli (bukan persen, bukan jarak di peta)">
                        {n.similarity.toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Link href={`/studi/istilah?q=${encodeURIComponent(term.term)}`} className="btn btn-secondary btn-sm mt-4 self-start">
              Buka di Daftar <ArrowUpRight className="size-3.5" />
            </Link>
          </>
        )
      )}
    </aside>
  );
}
