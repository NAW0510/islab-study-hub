"use client";

import { useState, useTransition, type ReactNode } from "react";
import { SwapMotion } from "./motion";
import { NavSlot } from "./shell/nav-slot";
import { SlideGroup } from "./slide-group";

/**
 * Tabs whose panels are all rendered up front, so switching is instant.
 * The tab row sits in the top bar's second row (the route keeps that row
 * open, see subNavFor), so it stays at hand while scrolling; the raised pill
 * slides to the chosen tab. The active tab is mirrored into `?tab=` (without
 * a server round trip) so links and reloads land on the same tab, and the
 * panels crossfade in place. One UrlTabs per page.
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
      <NavSlot>
        <div role="tablist" aria-label={label}>
          <SlideGroup className="segmented segmented-sm">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`tab-${t.key}`}
                aria-selected={active === t.key}
                aria-controls={`panel-${t.key}`}
                onClick={() => select(t.key)}
                className="segmented-item"
              >
                {t.label}
                {t.count !== undefined && <span className="font-display text-[0.6875rem] text-muted tabular-nums">{t.count}</span>}
              </button>
            ))}
          </SlideGroup>
        </div>
      </NavSlot>
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
