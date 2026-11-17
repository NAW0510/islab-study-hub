import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "list", href: "/vocab", label: "Daftar" },
  { key: "library", href: "/vocab/perpustakaan", label: "Perpustakaan" },
  { key: "map", href: "/vocab/map", label: "Peta Otak" },
  { key: "domains", href: "/vocab/domains", label: "Domain" },
] as const;

export type VocabTab = (typeof TABS)[number]["key"];

/** Sub-navigation shared by the Kosakata pages. */
export function VocabTabs({ active }: { active: VocabTab }) {
  return (
    <nav aria-label="Bagian Kosakata" className="mb-6 border-b border-border">
      {/* The links sit on top of the nav's bottom border; the inner row scrolls sideways on narrow screens. */}
      <div className="-mb-px flex gap-1 overflow-x-auto">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={tab.key === active ? "page" : undefined}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
              tab.key === active ? "border-accent text-text" : "border-transparent text-muted hover:text-text",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
