import Link from "next/link";
import { Pause, Play } from "lucide-react";

type MarqueeTerm = { id: string; term: string };

/** Seconds per item, so a short strip does not race and a long one does not crawl. */
const SECONDS_PER_ITEM = 3;
const MIN_SECONDS = 24;

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
    terms.map((t) => (
      <li key={t.id} className="flex shrink-0 items-center gap-6">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
        <Link
          href={`/vocab?term=${t.id}`}
          tabIndex={copy ? -1 : undefined}
          className="inline-flex min-h-11 items-center font-display text-lg font-semibold tracking-tight whitespace-nowrap text-text hover:text-accent focus-visible:rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus)"
        >
          {t.term}
        </Link>
      </li>
    ));

  return (
    <div className="card marquee py-1.5" style={{ "--marquee-duration": `${seconds}s` } as React.CSSProperties}>
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
