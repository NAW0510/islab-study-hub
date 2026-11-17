import { cn } from "@/lib/utils";

/** The Bauhaus shapes (clip paths in globals.css, `.shape-*`). */
export const SHAPES = ["circle", "square", "triangle", "plus", "x", "spark", "half", "quarter", "diamond", "leaf"] as const;
export type ShapeKind = (typeof SHAPES)[number];

/**
 * Fills: the four primaries; paper (light even at night, for shapes on a
 * coloured tile); ink on paper (dark in both schemes, e.g. on yellow); and
 * the page's own ink.
 */
const FILL = {
  blue: "bg-mark-blue",
  yellow: "bg-mark-yellow",
  red: "bg-mark-red",
  green: "bg-mark-green",
  paper: "bg-paper",
  "paper-ink": "bg-paper-ink",
  text: "bg-text",
  muted: "bg-muted",
} as const;
export type ShapeColor = keyof typeof FILL;

/** A decorative Bauhaus shape (hidden from screen readers). Size it with `size-*`. */
export function Shape({ kind, color, className }: { kind: ShapeKind; color?: ShapeColor; className?: string }) {
  return <span aria-hidden="true" className={cn("shape", `shape-${kind}`, color && FILL[color], className)} />;
}
