"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const ACTIVE = '[aria-current="page"], [aria-pressed="true"], [aria-selected="true"]';

/**
 * A row of choices whose raised pill slides to the active one (the top bar's
 * sections, the Kosakata tabs, the view switches). The pill is one element
 * that moves with a transform, so it never covers the labels, and it works
 * wherever the row stays mounted (the top bar stays mounted between pages).
 * The active item is the child with aria-current="page", aria-pressed="true"
 * or aria-selected="true". Before the first measure (server render, first
 * paint) the active item draws the pill itself, so nothing pops in.
 */
export function SlideGroup({ className, children }: { className?: string; children: ReactNode }) {
  const groupRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const group = groupRef.current;
    const thumb = thumbRef.current;
    if (!group || !thumb) return;
    let frame = 0;
    const place = () => {
      const active = group.querySelector<HTMLElement>(ACTIVE);
      if (!active || active.offsetWidth === 0) {
        delete group.dataset.ready;
        return;
      }
      thumb.style.setProperty("--x", `${active.offsetLeft}px`);
      thumb.style.setProperty("--w", `${active.offsetWidth}px`);
      // Slide only after the first placement has been drawn.
      if (group.dataset.ready === undefined) {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => (group.dataset.ready = ""));
      }
    };
    place();
    const resize = new ResizeObserver(place);
    resize.observe(group);
    const changes = new MutationObserver(place);
    changes.observe(group, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-current", "aria-pressed", "aria-selected"] });
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      changes.disconnect();
    };
  }, []);

  return (
    <div ref={groupRef} className={cn("slide-group", className)}>
      <span ref={thumbRef} aria-hidden="true" className="slide-thumb" />
      {children}
    </div>
  );
}
