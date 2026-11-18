"use client";

import Link from "next/link";
import { useEffect } from "react";
import type { VocabTab } from "../shell/nav-items";
import { SlideGroup } from "../slide-group";
import { preloadLibraryWorld } from "./library/world-preload";

const TABS = [
  { key: "list", href: "/vocab", label: "Daftar" },
  { key: "library", href: "/vocab/perpustakaan", label: "Perpustakaan" },
  { key: "map", href: "/vocab/map", label: "Peta Otak" },
  { key: "domains", href: "/vocab/domains", label: "Domain" },
] as const satisfies readonly { key: VocabTab; href: string; label: string }[];

export type { VocabTab };

/**
 * The Kosakata pages, in the top bar's second row (navbar.tsx). The bar stays
 * mounted between them, so the raised pill slides to the new tab. Heading
 * for the Perpustakaan (pointer over, focus, press) starts loading its world.
 */
export function VocabTabs({ active }: { active: VocabTab }) {
  // Idle on another Kosakata page: load the Perpustakaan's world quietly, for a touch or a key that gives no warning.
  useEffect(() => {
    if (active === "library") return;
    const idle = typeof window.requestIdleCallback === "function";
    const id = idle ? window.requestIdleCallback(() => preloadLibraryWorld(), { timeout: 4000 }) : window.setTimeout(preloadLibraryWorld, 2000);
    return () => (idle ? window.cancelIdleCallback(id) : window.clearTimeout(id));
  }, [active]);

  return (
    <nav aria-label="Bagian Kosakata">
      <SlideGroup className="segmented segmented-sm">
        {TABS.map((tab) => {
          const intent = tab.key === "library" && tab.key !== active ? preloadLibraryWorld : undefined;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={tab.key === active ? "page" : undefined}
              className="segmented-item"
              onPointerEnter={intent}
              onFocus={intent}
              onPointerDown={intent}
            >
              {tab.label}
            </Link>
          );
        })}
      </SlideGroup>
    </nav>
  );
}
