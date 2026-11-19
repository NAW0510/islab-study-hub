"use client";

import { useState, useTransition, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SlidingMarker, SwapMotion } from "./motion";

/**
 * Tabs whose panels are all rendered up front, so switching is instant.
 * The active tab is mirrored into `?tab=` (without a server round trip) so
 * links and reloads land on the same tab. Switching runs in a transition:
 * the underline slides to the new tab and the panels crossfade in place.
 * One UrlTabs per page (the marker's transition name is shared).
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
  const [, startTransition] = useTransition();

  function select(key: string) {
    startTransition(() => setActive(key));
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
        className="no-scrollbar mb-7 flex gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--border)]"
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
              "relative flex shrink-0 items-center gap-2 rounded-t-control px-3.5 py-3 text-[0.9375rem] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-(--focus)",
              active === t.key ? "text-text" : "text-muted hover:text-text",
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="rounded-full bg-surface-2 px-1.5 font-display text-xs text-muted tabular-nums">{t.count}</span>
            )}
            {active === t.key && (
              <SlidingMarker name="url-tabs-marker">
                <span aria-hidden="true" className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-text" />
              </SlidingMarker>
            )}
          </button>
        ))}
      </div>
      <SwapMotion>
        <div>
          {tabs.map((t) => (
            // Inactive panels stay mounted (just hidden) so their state — e.g. an open form — survives.
            <div key={t.key} role="tabpanel" id={`panel-${t.key}`} aria-labelledby={`tab-${t.key}`} hidden={active !== t.key}>
              {panels[t.key]}
            </div>
          ))}
        </div>
      </SwapMotion>
    </>
  );
}
