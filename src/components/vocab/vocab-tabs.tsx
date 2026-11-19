import Link from "next/link";
import { cn } from "@/lib/utils";
import { SlidingMarker } from "../motion";

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
export function VocabTabs({
  active,
  variant = "line",
  inline = false,
}: {
  active: VocabTab;
  variant?: "line" | "pill";
  /** The pill inside a row of controls (the Peta Otak head) instead of centred on its own line. */
  inline?: boolean;
}) {
  if (variant === "pill") {
    return (
      <nav aria-label="Bagian Kosakata" className={inline ? "flex max-w-full min-w-0" : "mb-6 flex justify-center"}>
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
    <nav aria-label="Bagian Kosakata" className="mb-7 border-b border-border">
      {/* The links sit on top of the nav's bottom border; the inner row scrolls sideways on narrow screens. */}
      <div className="no-scrollbar -mb-px flex gap-1 overflow-x-auto">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={tab.key === active ? "page" : undefined}
            className={cn(
              "relative shrink-0 px-3.5 py-3 text-[0.9375rem] font-medium whitespace-nowrap transition-colors",
              tab.key === active ? "text-text" : "text-muted hover:text-text",
            )}
          >
            {tab.label}
            {/* Every Kosakata page draws this marker under its own tab, so it slides between pages. */}
            {tab.key === active && (
              <SlidingMarker name="vocab-tabs-marker">
                <span aria-hidden="true" className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-text" />
              </SlidingMarker>
            )}
          </Link>
        ))}
      </div>
    </nav>
  );
}
