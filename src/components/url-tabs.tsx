"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Tabs whose panels are all rendered up front, so switching is instant.
 * The active tab is mirrored into `?tab=` (without a server round trip) so
 * links and reloads land on the same tab.
 */
export function UrlTabs({
  tabs,
  initial,
  panels,
  label,
}: {
  tabs: { key: string; label: string; count?: number }[];
  initial: string;
  panels: Record<string, ReactNode>;
  label: string;
}) {
  const [active, setActive] = useState(initial);

  function select(key: string) {
    setActive(key);
    const url = new URL(window.location.href);
    if (key === tabs[0].key) url.searchParams.delete("tab");
    else url.searchParams.set("tab", key);
    window.history.replaceState(null, "", url);
  }

  return (
    <>
      <div
        role="tablist"
        aria-label={label}
        className="no-scrollbar mb-6 flex gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--border)]"
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={active === t.key}
            aria-controls={`panel-${t.key}`}
            onClick={() => select(t.key)}
            className={cn(
              "flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition",
              active === t.key ? "border-accent text-text" : "border-transparent text-muted hover:text-text",
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="rounded-full bg-surface-2 px-1.5 text-xs text-muted tabular-nums">{t.count}</span>
            )}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        // Inactive panels stay mounted (just hidden) so their state — e.g. an open form — survives.
        <div key={t.key} role="tabpanel" id={`panel-${t.key}`} aria-labelledby={`tab-${t.key}`} hidden={active !== t.key}>
          {panels[t.key]}
        </div>
      ))}
    </>
  );
}
