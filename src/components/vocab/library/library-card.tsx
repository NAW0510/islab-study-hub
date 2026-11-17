"use client";

import { memo, useState, type MouseEvent } from "react";
import { ArrowDownRight, RotateCcw } from "lucide-react";
import type { DomainColor } from "@/lib/vocab/seed-domains";
import { RollText } from "../../roll-text";
import { CoverArt } from "./cover-art";

export type LibraryCardData = {
  id: string;
  /** The term, or the field's name on the shelf. */
  term: string;
  /** "Deep Learning › Machine Learning · W8", or "24 istilah · 3 cabang" for a field. */
  meta: string;
  color: DomainColor;
  /** Plain excerpt of the definition (or a field's branches); empty when there is none. */
  definition: string;
};

/**
 * One sheet in the Perpustakaan's river: the cover, a title and a line under
 * it on the front. The sheet is a link (a field's room, or a term's page);
 * the page plays the transition (`onOpen`). A term's sheet also turns over
 * to its definition with the small "Balik" button in its corner (a toggle,
 * aria-pressed); only the visible face reaches screen readers.
 *
 * With the WebGL world running, the world draws this sheet (bent, folded,
 * flipped) over the same rect and the DOM faces turn transparent; the link
 * keeps the focus, the hit area and the accessible name.
 */
export const LibraryCard = memo(function LibraryCard({
  card,
  href,
  onOpen,
  kind,
}: {
  card: LibraryCardData;
  href: string;
  onOpen: (event: MouseEvent<HTMLAnchorElement>) => void;
  kind: "field" | "term";
}) {
  const [flipped, setFlipped] = useState(false);
  const isTerm = kind === "term";
  return (
    <li
      className="library-item"
      data-library-card
      data-kind={isTerm ? undefined : "field"}
      data-term-id={card.id}
      data-color={card.color}
      data-flipped={(isTerm && flipped) || undefined}
    >
      <div className="library-flip">
        <a href={href} onClick={onOpen} className="library-sheet">
          <span className="library-front" aria-hidden={flipped}>
            <span className="library-cover">
              <CoverArt seed={card.id} color={card.color} />
              <span className="library-sweep" aria-hidden="true" />
            </span>
            <span className="library-strip">
              <span className="library-title">
                <RollText>{card.term}</RollText>
              </span>
              <span className="library-meta">{card.meta}</span>
              <ArrowDownRight className="library-arrow" aria-hidden="true" />
            </span>
            <span className="library-rule" aria-hidden="true" />
          </span>
          <span className="library-back" aria-hidden={!flipped}>
            <span className="eyebrow">{isTerm ? `Definisi · ${card.term}` : `Cabang · ${card.term}`}</span>
            <span className="library-definition">{card.definition || "Belum ada definisi."}</span>
          </span>
        </a>
      </div>
      {isTerm && (
        <button
          type="button"
          className="icon-btn library-open"
          aria-pressed={flipped}
          aria-label={flipped ? `Tampilkan sampul ${card.term}` : `Balik ke definisi ${card.term}`}
          title={flipped ? "Kembali ke sampul" : "Lihat definisi"}
          onClick={() => setFlipped((f) => !f)}
        >
          <RotateCcw className="size-4" aria-hidden="true" />
        </button>
      )}
    </li>
  );
});
