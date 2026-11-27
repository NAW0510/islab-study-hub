"use client";

import Link from "next/link";
import type { TermsTab } from "../shell/nav-items";
import { SlideGroup } from "../slide-group";

const TABS = [
  { key: "list", href: "/studi/istilah", label: "Daftar" },
  { key: "map", href: "/studi/istilah/peta", label: "Peta Otak" },
  { key: "domains", href: "/studi/istilah/domain", label: "Domain" },
] as const satisfies readonly { key: TermsTab; href: string; label: string }[];

export type { TermsTab };

/**
 * Istilah Teknis' pages, in the top bar's second row after the Ruang
 * Studi's parts (navbar.tsx). The bar stays mounted between them, so the
 * raised pill slides to the new tab.
 */
export function TermsTabs({ active }: { active: TermsTab }) {
  return (
    <nav aria-label="Halaman Istilah Teknis">
      <SlideGroup className="segmented segmented-sm">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={tab.key === active ? "page" : undefined}
            className="segmented-item"
          >
            {tab.label}
          </Link>
        ))}
      </SlideGroup>
    </nav>
  );
}
