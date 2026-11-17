import { COVER_COLS, COVER_ROWS, coverPattern, TILE_PATHS } from "@/lib/vocab/library/cover-pattern";
import type { DomainColor } from "@/lib/vocab/seed-domains";
import { cn } from "@/lib/utils";

/**
 * A term's Bauhaus cover as SVG: its shapes in the field colour on paper.
 * The world draws the same tiles into its own texture (card-texture.ts).
 * Colours: `--cover-main` is the field token; `.library-cover` in
 * globals.css derives the deep tone and the paper from it.
 */
export function CoverArt({ seed, color, className }: { seed: string; color: DomainColor; className?: string }) {
  const tiles = coverPattern(seed);
  return (
    <svg
      viewBox={`0 0 ${COVER_COLS * 100} ${COVER_ROWS * 100}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      className={cn("library-cover-art", className)}
      style={{ "--cover-main": `var(--${color})` } as React.CSSProperties}
    >
      <rect width={COVER_COLS * 100} height={COVER_ROWS * 100} fill="var(--paper)" />
      {tiles.map((t) => (
        <path
          key={`${t.col}:${t.row}`}
          d={TILE_PATHS[t.kind]}
          transform={`translate(${t.col * 100} ${t.row * 100}) rotate(${t.rotation} 50 50)`}
          fill={t.ink === "main" ? "var(--cover-main)" : "var(--cover-deep)"}
          fillRule="evenodd"
        />
      ))}
    </svg>
  );
}
