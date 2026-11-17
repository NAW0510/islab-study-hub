"use client";

import Link from "next/link";
import { memo, useState, type MouseEvent } from "react";
import { ArrowDownRight, Maximize2 } from "lucide-react";
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
 * it on the front.
 *
 * A term's sheet is a toggle button (click, tap, Enter, Space) that turns
 * to its definition; only the visible face reaches screen readers, and
 * "Buka detail" opens the term's drawer. A field's sheet (`href`) is a link
 * into that field's room; the page plays the transition (`onOpen`).
 *
 * With the WebGL world running, the world draws this sheet (bent, folded,
 * flipped) over the same rect and the DOM faces turn transparent; the button
 * or link keeps the focus, the hit area and the accessible name.
 */
export const LibraryCard = memo(function LibraryCard({
  card,
  href,
  onOpen,
}: {
  card: LibraryCardData;
  href?: string;
  onOpen?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const [flipped, setFlipped] = useState(false);
  const front = (hidden: boolean) => (
    <span className="library-front" aria-hidden={hidden}>
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
  );
  const back = (hidden: boolean, label: string) => (
    <span className="library-back" aria-hidden={hidden}>
      <span className="eyebrow">{label}</span>
      <span className="library-definition">{card.definition || "Belum ada definisi."}</span>
    </span>
  );

  if (href) {
    return (
      <li className="library-item" data-library-card data-kind="field" data-term-id={card.id} data-color={card.color}>
        <div className="library-flip">
          <a href={href} onClick={onOpen} className="library-sheet">
            {front(false)}
            {back(true, `Cabang · ${card.term}`)}
          </a>
        </div>
      </li>
    );
  }

  return (
    <li className="library-item" data-library-card data-term-id={card.id} data-color={card.color} data-flipped={flipped || undefined}>
      <div className="library-flip">
        <button type="button" aria-pressed={flipped} onClick={() => setFlipped((f) => !f)} className="library-sheet">
          {front(flipped)}
          {back(!flipped, `Definisi · ${card.term}`)}
        </button>
      </div>
      <Link href={`/vocab?term=${card.id}`} className="icon-btn library-open" aria-label={`Buka detail ${card.term}`} title="Buka detail">
        <Maximize2 className="size-4" />
      </Link>
    </li>
  );
});
