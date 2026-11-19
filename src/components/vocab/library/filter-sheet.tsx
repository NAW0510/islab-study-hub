"use client";

import { useRef } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type FilterOption = { key: string | null; label: string; count: number };

/**
 * "Filter": the fields with their counts in a native popover (light dismiss
 * and Escape come with it). A panel under the head on wide screens, a sheet
 * across the bottom on phones (`.library-filter` in globals.css). Picking one
 * closes it, and the button then carries that field's name.
 */
export function FilterSheet({
  options,
  active,
  onPick,
}: {
  options: FilterOption[];
  active: string | null;
  onPick: (key: string | null) => void;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.key === active);
  return (
    <>
      <button
        type="button"
        popoverTarget="library-filter"
        className={cn("btn h-11 shrink-0", active ? "btn-primary" : "btn-secondary")}
        aria-haspopup="dialog"
        onClick={(e) => {
          // A panel right under the button on wide screens; the CSS sheet at the bottom on phones.
          const panel = sheet.current;
          if (!panel) return;
          const wide = window.matchMedia("(min-width: 40.01rem)").matches;
          panel.style.top = wide ? `${e.currentTarget.getBoundingClientRect().bottom + 8}px` : "";
        }}
      >
        {active ? (current?.label ?? "Filter") : "Filter"}
        <ChevronDown className="size-4" aria-hidden="true" />
      </button>
      <div id="library-filter" ref={sheet} popover="auto" role="dialog" aria-label="Filter bidang" className="library-filter">
        <p className="eyebrow mb-2 px-2">Bidang</p>
        <ul className="flex flex-col">
          {options.map((o) => (
            <li key={o.key ?? "all"}>
              <button
                type="button"
                aria-pressed={o.key === active}
                onClick={() => {
                  onPick(o.key);
                  sheet.current?.hidePopover();
                }}
                className="flex min-h-11 w-full items-center gap-3 rounded-control px-2 text-left text-sm hover:bg-surface-2"
              >
                <span className="flex-1">{o.label}</span>
                <span className="text-xs text-muted tabular-nums">{o.count}</span>
                <Check className={cn("size-4 text-accent", o.key !== active && "invisible")} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
