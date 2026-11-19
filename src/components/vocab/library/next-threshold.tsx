"use client";

import { useEffect, useRef, type MouseEvent, type RefObject } from "react";
import { ArrowDown } from "lucide-react";
import type { DomainColor } from "@/lib/vocab/seed-domains";

/**
 * The end of a term's page pulls the next term in (after the Articles page
 * of labmgm.org, itself after unseen.co):
 *
 *   Only input after reaching the bottom counts: wheel travel fills a
 *   progress of two viewport heights, a drag of 400 px fills it, and Arrow
 *   Down, Page Down, Space and End add steps. Shortly after the input stops
 *   it drains back over a second; scrolling up cancels it at once. The shown
 *   progress follows at a fifth of the way per frame.
 *
 *   Progress raises a dome of the next term's colour from the bottom (its
 *   apex half the screen at 100 %), and carries the next term's name up.
 *   At 100 %, or on a click or Enter (it is a real link), the dome floods
 *   the screen and the page swaps to the next term under it (`onCommit`);
 *   the page then lets the flood fade.
 *
 * The dome is the page's own element (`domeRef`), so it survives the swap.
 * Transform and opacity only. Reduced motion: none of this runs; the
 * threshold is a plain link.
 */
const WHEEL_SPAN = 2; // viewport heights of wheel travel for a full pull
const DRAG_SPAN = 400; // px of drag for a full pull
const KEY_STEP = 0.14;
const DRAIN_AFTER = 75; // ms of quiet before it drains
const DRAIN = 1; // s to drain from full

export function NextThreshold({
  next,
  domeRef,
  onCommit,
}: {
  next: { id: string; term: string; path: string; color: DomainColor };
  domeRef: RefObject<HTMLDivElement | null>;
  onCommit: () => void;
}) {
  const link = useRef<HTMLAnchorElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const title = useRef<HTMLSpanElement>(null);
  const committed = useRef(false);
  const commit = useRef<() => void>(() => undefined);
  // The latest onCommit, without restarting the pull (and losing its progress) on every render.
  const onCommitRef = useRef(onCommit);
  useEffect(() => {
    onCommitRef.current = onCommit;
  });

  useEffect(() => {
    const dome = domeRef.current;
    if (!dome) return;
    committed.current = false;
    dome.style.setProperty("--dome-colour", `color-mix(in srgb, var(--${next.color}) 42%, var(--bg))`);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const flood = () => {
      if (committed.current) return;
      committed.current = true;
      if (reduced) return onCommitRef.current();
      dome.hidden = false;
      dome
        .animate([{ transform: getComputedStyle(dome).transform === "none" ? "translateY(100%)" : getComputedStyle(dome).transform }, { transform: "translateY(-12%)" }], {
          duration: 650,
          easing: "cubic-bezier(0.65, 0, 0.35, 1)",
          fill: "forwards",
        })
        .finished.then(() => onCommitRef.current())
        .catch(() => onCommitRef.current());
    };
    commit.current = flood;
    if (reduced) return;

    let target = 0;
    let shown = 0;
    let lastInput = 0;
    let frame = 0;
    let touchY: number | null = null;
    const atBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
    const add = (amount: number) => {
      if (committed.current) return;
      target = Math.min(1, Math.max(0, target + amount));
      lastInput = performance.now();
      if (target >= 1) flood();
    };
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) target = 0;
      else if (atBottom()) add(e.deltaY / (WHEEL_SPAN * window.innerHeight));
    };
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY;
      if (touchY === null || y === undefined) return;
      const dy = touchY - y;
      touchY = y;
      if (dy < 0) target = 0;
      else if (atBottom()) add(dy / DRAG_SPAN);
    };
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName);
      if (typing || !atBottom()) return;
      if (["ArrowDown", "PageDown", " ", "End"].includes(e.key)) add(KEY_STEP);
      if (e.key === "ArrowUp" || e.key === "PageUp") target = 0;
    };
    const tick = () => {
      frame = requestAnimationFrame(tick);
      if (committed.current) return;
      if (performance.now() - lastInput > DRAIN_AFTER) target = Math.max(0, target - 1 / (60 * DRAIN));
      shown += (target - shown) * 0.2;
      const p = shown < 0.001 ? 0 : shown;
      dome.hidden = p === 0;
      // The dome is 118vh tall and sits on the bottom edge: its top rises from the bottom of the screen to its middle.
      dome.style.transform = `translateY(calc(${(1 - p * 0.5) * 100}vh + 18vh))`;
      if (label.current) label.current.style.transform = `translateY(${(1 - Math.min(1, p * 3)) * 100}%)`;
      if (title.current) title.current.style.transform = `translateY(${-p * 22}vh)`;
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("keydown", onKey);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKey);
    };
  }, [next.id, next.color, domeRef]);

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    commit.current();
  };

  return (
    <a ref={link} href={`?istilah=${next.id}`} onClick={onClick} className="library-next" data-library-next>
      <span className="library-next-label">
        <span ref={label} className="inline-flex items-center gap-2">
          Istilah berikutnya <ArrowDown className="size-4" aria-hidden="true" />
        </span>
      </span>
      <span ref={title} className="library-next-title display">
        {next.term}
      </span>
      <span className="library-next-path">{next.path}</span>
      <span className="library-next-hint">Gulir terus, seret ke atas, atau klik</span>
    </a>
  );
}
