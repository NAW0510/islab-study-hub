import Link from "next/link";
import { Pause, Play } from "lucide-react";
import { Shape, type ShapeColor, type ShapeKind } from "@/components/shape";

type MarqueeTerm = { id: string; term: string };

/** Seconds per item, so a short strip does not race and a long one does not crawl. */
const SECONDS_PER_ITEM = 3;
const MIN_SECONDS = 24;

/** The shapes between the terms, in turn. */
const SHAPES: ShapeKind[] = ["circle", "square", "triangle", "plus", "half", "spark"];
const COLORS: ShapeColor[] = ["blue", "yellow", "red", "green"];

/**
 * Dashboard strip of the latest terms (spec §8.2, §9). Server component with
 * no JavaScript: it moves with CSS (`.marquee` in globals.css), stops on
 * hover or focus, and stands still with reduced motion. The second group is
 * only there to close the loop, so it is hidden from screen readers and
 * cannot be focused. Each term opens its detail in Kosakata.
 *
 * Put it inside an element with the `marquee-host` class, together with
 * <TermMarqueePause />, so the pause switch can reach the strip.
 */
export function TermMarquee({ terms }: { terms: MarqueeTerm[] }) {
  if (terms.length === 0) return null;
  const seconds = Math.max(MIN_SECONDS, terms.length * SECONDS_PER_ITEM);
  const items = (copy: boolean) =>
    terms.map((t, i) => (
      <li key={t.id} className="flex shrink-0 items-center gap-7">
        <Shape kind={SHAPES[i % SHAPES.length]} color={COLORS[i % COLORS.length]} className="size-3.5" />
        <Link
          href={`/vocab?term=${t.id}`}
          tabIndex={copy ? -1 : undefined}
          className="display inline-flex min-h-13 items-center text-[clamp(1.375rem,1.1rem+1vw,1.875rem)] whitespace-nowrap text-text hover:text-accent focus-visible:rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus)"
        >
          {t.term}
        </Link>
      </li>
    ));

  return (
    <div className="card marquee py-2.5" style={{ "--marquee-duration": `${seconds}s` } as React.CSSProperties}>
      <ul className="marquee-group">{items(false)}</ul>
      <ul className="marquee-group" aria-hidden="true" inert>
        {items(true)}
      </ul>
    </div>
  );
}

/** "Jeda": a checkbox styled as an icon button; CSS pauses the strip while it is ticked. */
export function TermMarqueePause() {
  return (
    <label className="icon-btn marquee-toggle cursor-pointer" title="Jeda / lanjutkan gerak">
      <input type="checkbox" className="marquee-pause sr-only" aria-label="Jeda gerak strip istilah" />
      <Pause className="when-running size-4" aria-hidden="true" />
      <Play className="when-paused size-4" aria-hidden="true" />
    </label>
  );
}
