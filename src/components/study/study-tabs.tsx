"use client";

import Link from "next/link";
import { useEffect } from "react";
import { BookA, Languages, LibraryBig } from "lucide-react";
import type { StudyPart } from "../shell/nav-items";
import { SlideGroup } from "../slide-group";
import { preloadLibraryWorld } from "../vocab/library/world-preload";

const PARTS = [
  { key: "library", href: "/studi", label: "Perpustakaan", icon: LibraryBig },
  { key: "terms", href: "/studi/istilah", label: "Istilah Teknis", icon: BookA },
  { key: "languages", href: "/studi/bahasa", label: "Bahasa", icon: Languages },
] as const satisfies readonly { key: StudyPart; href: string; label: string; icon: unknown }[];

/**
 * The Ruang Studi's parts, first in the top bar's second row (navbar.tsx).
 * The bar stays mounted between them, so the raised pill slides to the new
 * part. `compact` (on the Peta Otak, whose row is full) keeps the words for
 * the widest screens and shows the icons otherwise. Heading for the
 * Perpustakaan (pointer over, focus, press) starts loading its world, and
 * idling elsewhere in the Ruang Studi loads it quietly.
 */
export function StudyTabs({ active, compact = false }: { active: StudyPart; compact?: boolean }) {
  useEffect(() => {
    if (active === "library") return;
    const idle = typeof window.requestIdleCallback === "function";
    const id = idle ? window.requestIdleCallback(() => preloadLibraryWorld(), { timeout: 4000 }) : window.setTimeout(preloadLibraryWorld, 2000);
    return () => (idle ? window.cancelIdleCallback(id) : window.clearTimeout(id));
  }, [active]);

  return (
    <nav aria-label="Bagian Ruang Studi">
      <SlideGroup className="segmented segmented-sm">
        {PARTS.map((part) => {
          const intent = part.key === "library" && active !== "library" ? preloadLibraryWorld : undefined;
          const Icon = part.icon;
          return (
            <Link
              key={part.key}
              href={part.href}
              title={compact ? part.label : undefined}
              aria-current={part.key === active ? "page" : undefined}
              className="segmented-item gap-1.5"
              onPointerEnter={intent}
              onFocus={intent}
              onPointerDown={intent}
            >
              <Icon aria-hidden="true" className="size-3.5 shrink-0" />
              <span className={compact ? "sr-only 2xl:not-sr-only" : undefined}>{part.label}</span>
            </Link>
          );
        })}
      </SlideGroup>
    </nav>
  );
}
