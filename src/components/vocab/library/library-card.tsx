"use client";

import Link from "next/link";
import { memo, useState } from "react";
import { ArrowDownRight, Maximize2 } from "lucide-react";
import type { DomainColor } from "@/lib/vocab/seed-domains";
import { RollText } from "../../roll-text";
import { CoverArt } from "./cover-art";

export type LibraryCardData = {
  id: string;
  term: string;
  /** "Deep Learning › Machine Learning", or "Tanpa domain". */
  domain: string;
  color: DomainColor;
  week: number;
  /** Plain excerpt of the definition; empty when there is none. */
  definition: string;
};

/**
 * One sheet in the Perpustakaan's river: the cover, the term and its field on
 * the front, the definition on the back. The sheet is a toggle button (click,
 * tap, Enter, Space), and only the visible face reaches screen readers. With
 * the WebGL world running, the world draws this sheet (bent, folded, flipped)
 * over the same rect and the DOM faces turn transparent; the button keeps the
 * focus, the hit area and the accessible name (`data-library-card`).
 */
export const LibraryCard = memo(function LibraryCard({ card }: { card: LibraryCardData }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <li
      className="library-item"
      data-library-card
      data-term-id={card.id}
      data-color={card.color}
      data-flipped={flipped || undefined}
    >
      <div className="library-flip">
        <button
          type="button"
          aria-pressed={flipped}
          onClick={() => setFlipped((f) => !f)}
          className="library-sheet"
        >
          <span className="library-front" aria-hidden={flipped}>
            <span className="library-cover">
              <CoverArt seed={card.id} color={card.color} />
              <span className="library-sweep" aria-hidden="true" />
            </span>
            <span className="library-strip">
              <span className="library-title">
                <RollText>{card.term}</RollText>
              </span>
              <span className="library-meta">
                {card.domain} · W{card.week}
              </span>
              <ArrowDownRight className="library-arrow" aria-hidden="true" />
            </span>
            <span className="library-rule" aria-hidden="true" />
          </span>
          <span className="library-back" aria-hidden={!flipped}>
            <span className="eyebrow">Definisi · {card.term}</span>
            <span className="library-definition">{card.definition || "Belum ada definisi."}</span>
          </span>
        </button>
      </div>
      <Link href={`/vocab?term=${card.id}`} className="icon-btn library-open" aria-label={`Buka detail ${card.term}`} title="Buka detail">
        <Maximize2 className="size-4" />
      </Link>
    </li>
  );
});
