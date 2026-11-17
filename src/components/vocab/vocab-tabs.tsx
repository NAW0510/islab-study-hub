import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "list", href: "/vocab", label: "Daftar" },
  { key: "library", href: "/vocab/perpustakaan", label: "Perpustakaan" },
  { key: "map", href: "/vocab/map", label: "Peta Otak" },
  { key: "domains", href: "/vocab/domains", label: "Domain" },
] as const;

export type VocabTab = (typeof TABS)[number]["key"];

/**
 * Sub-navigation shared by the Kosakata pages: an underlined row, or (on
 * the Perpustakaan, over its world) a floating glass pill.
 */
export function VocabTabs({ active, variant = "line" }: { active: VocabTab; variant?: "line" | "pill" }) {
  if (variant === "pill") {
    return (
      <nav aria-label="Bagian Kosakata" className="mb-6 flex justify-center">
        <div className="segmented segmented-glass max-w-full overflow-x-auto no-scrollbar">
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
        </div>
      </nav>
    );
  }
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
