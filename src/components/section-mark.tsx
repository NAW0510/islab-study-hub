"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { NAV_ITEMS, navNumber, sectionOf } from "./shell/nav-items";
import { Shape } from "./shape";

/**
 * The chapter mark above a page title: the section's shape, its number, a
 * rule, and the section's name (or `children`, e.g. a link back). The number
 * is decoration, so screen readers hear the words only.
 */
export function SectionMark({ children }: { children?: ReactNode }) {
  const section = sectionOf(usePathname());
  const index = NAV_ITEMS.findIndex((item) => item.href === section.href);
  return (
    <p className="eyebrow">
      <Shape kind={section.shape} color={section.color} className="size-2.5" />
      <span aria-hidden="true" className="font-display tracking-[0.06em] text-text tabular-nums">
        {navNumber(index)}
      </span>
      <span className="eyebrow-rule" />
      {children ?? section.label}
    </p>
  );
}
