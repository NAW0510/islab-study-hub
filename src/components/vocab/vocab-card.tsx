"use client";

import { useState } from "react";
import { Maximize2 } from "lucide-react";
import { weekNumberFor } from "@/lib/report-template";
import type { VocabTerm } from "@/lib/types";
import { excerpt } from "@/lib/utils";
import { extraDomainIds, type DomainIndex } from "@/lib/vocab/format";
import { DomainChip } from "./domain-chip";

/**
 * One term in the "Kartu" view of Kosakata (spec §3.4): the term and its
 * domain on the front, the definition on the back. The card is a toggle
 * button, so click, tap, Enter and Space all turn it; only the face that is
 * showing is exposed to screen readers. "Buka detail" sits outside the
 * turning part and opens the same drawer as the list. The back shows a plain
 * excerpt: the full Markdown and formulas stay in the drawer, which keeps a
 * grid of hundreds of cards light.
 */
export function VocabCard({
  term,
  domains,
  programStart,
  onOpen,
}: {
  term: VocabTerm;
  domains: DomainIndex;
  programStart: string;
  onOpen: () => void;
}) {
  const [flipped, setFlipped] = useState(false);
  const domain = term.domain_id ? (domains.get(term.domain_id) ?? null) : null;
  const extras = extraDomainIds(term).length;
  const definition = term.definition.trim() ? excerpt(term.definition, 420) : "";

  return (
    <li className="flip-card relative h-56" data-flipped={flipped || undefined}>
      <button
        type="button"
        aria-pressed={flipped}
        onClick={() => setFlipped((f) => !f)}
        className="flip-card-inner block size-full rounded-card text-left"
      >
        <span className="flip-face card flex flex-col p-4" aria-hidden={flipped}>
          <span className="eyebrow pr-10 tabular-nums" title={`Dipelajari ${term.learned_on}`}>
            W{weekNumberFor(programStart, term.learned_on)}
          </span>
          <span className="mt-auto line-clamp-3 font-display text-2xl font-semibold tracking-tight break-words">
            {term.term}
          </span>
          {term.aliases.length > 0 && (
            <span className="mt-1 truncate text-xs text-muted">{term.aliases.join(", ")}</span>
          )}
          <span className="mt-3 flex min-w-0">
            {!term.embedded_at && term.domain_source === "pending" ? (
              <span className="chip chip-tone tone-warn">Belum diproses</span>
            ) : term.domain_source === "pending" ? (
              <span className="chip chip-tone tone-none">Menunggu domain</span>
            ) : (
              <>
                <DomainChip domain={domain} domains={domains} />
                {extras > 0 && (
                  <span className="chip ml-1.5 shrink-0 bg-surface-2 text-muted" title="Juga milik domain lain">
                    +{extras}
                  </span>
                )}
              </>
            )}
          </span>
        </span>

        <span className="flip-face flip-back card flex flex-col p-4" aria-hidden={!flipped}>
          <span className="eyebrow pr-10">Definisi</span>
          {definition ? (
            <span className="mt-3 line-clamp-6 text-sm leading-6 text-text">{definition}</span>
          ) : (
            <span className="mt-3 text-sm text-muted">Belum ada definisi.</span>
          )}
        </span>
      </button>

      <button
        type="button"
        onClick={onOpen}
        className="icon-btn absolute top-2 right-2 z-10"
        aria-label={`Buka detail ${term.term}`}
        title="Buka detail"
      >
        <Maximize2 className="size-4" />
      </button>
    </li>
  );
}
