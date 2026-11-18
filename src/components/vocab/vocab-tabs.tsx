import Link from "next/link";
import type { VocabTab } from "../shell/nav-items";
import { SlideGroup } from "../slide-group";

const TABS = [
  { key: "list", href: "/vocab", label: "Daftar" },
  { key: "library", href: "/vocab/perpustakaan", label: "Perpustakaan" },
  { key: "map", href: "/vocab/map", label: "Peta Otak" },
  { key: "domains", href: "/vocab/domains", label: "Domain" },
] as const satisfies readonly { key: VocabTab; href: string; label: string }[];

export type { VocabTab };

/**
 * The Kosakata pages, in the top bar's second row (navbar.tsx). The bar stays
 * mounted between them, so the raised pill slides to the new tab.
 */
export function VocabTabs({ active }: { active: VocabTab }) {
  return (
    <nav aria-label="Bagian Kosakata">
      <SlideGroup className="segmented segmented-sm">
        {TABS.map((tab) => (
          <Link key={tab.key} href={tab.href} aria-current={tab.key === active ? "page" : undefined} className="segmented-item">
            {tab.label}
          </Link>
        ))}
      </SlideGroup>
    </nav>
  );
}
