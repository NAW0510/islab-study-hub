"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { RollText } from "@/components/roll-text";
import { cn } from "@/lib/utils";
import { BrandMark } from "./brand-mark";
import { LocalClock } from "./local-clock";
import { isActivePath, NAV_ITEMS, navNumber } from "./nav-items";
import { Brand, SignOutButton, WeekChip } from "./parts";

export type ShellProps = {
  email: string;
  /** e.g. "Week 07" */
  weekMarker: string;
  /** e.g. "9 Nov – 15 Nov 2026" */
  weekPeriod: string;
};

/** Pages that want the whole screen: the sidebar folds into a rail of numbers there. */
const IMMERSIVE = ["/vocab/perpustakaan"];

/** Desktop navigation. Hidden on phones (see MobileMenu) and in print. */
export function Sidebar({ email, weekMarker, weekPeriod }: ShellProps) {
  const pathname = usePathname();
  const immersive = IMMERSIVE.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  // Opened by hand on an immersive page: remembered for that page only.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const rail = immersive && openedOn !== pathname;

  return (
    <aside
      data-rail={rail || undefined}
      className={cn(
        "sidebar sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border py-5 md:flex print:!hidden",
        rail ? "w-[4.5rem] px-2" : "w-64 px-4",
      )}
    >
      <div className={cn("flex items-center", rail ? "justify-center" : "justify-between gap-2 px-2")}>
        {rail ? (
          <Link href="/" aria-label="IS Lab Study Hub, ke dashboard" title="Dashboard">
            <BrandMark />
          </Link>
        ) : (
          <Brand />
        )}
      </div>

      <nav className={cn("mt-8 flex flex-col gap-0.5", rail && "items-center")} aria-label="Navigasi utama">
        {NAV_ITEMS.map(({ href, label }, i) => {
          const active = isActivePath(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              prefetch
              aria-current={active ? "page" : undefined}
              aria-label={rail ? label : undefined}
              title={rail ? label : undefined}
              className={cn(
                "flex items-center rounded-control text-sm font-medium transition-colors duration-(--dur-fast)",
                rail ? "relative size-11 justify-center" : "gap-3 px-3 py-2",
                active ? "bg-surface-2 text-text" : "text-muted hover:bg-surface-2 hover:text-text",
              )}
            >
              <span
                className={cn("font-display tabular-nums", rail ? "text-xs" : "w-5 text-[11px] text-muted")}
                aria-hidden="true"
              >
                {navNumber(i)}
              </span>
              {!rail && <RollText>{label}</RollText>}
              {active && <span className={cn("size-1.5 rounded-full bg-accent", rail ? "absolute top-1.5 right-1.5" : "ml-auto")} />}
            </Link>
          );
        })}
      </nav>

      <div className={cn("mt-auto border-t border-border pt-4", rail && "flex flex-col items-center gap-2")}>
        {immersive && (
          <button
            type="button"
            className={cn("icon-btn", !rail && "mb-3")}
            onClick={() => setOpenedOn(rail ? pathname : null)}
            aria-label={rail ? "Lebarkan navigasi" : "Ciutkan navigasi"}
            title={rail ? "Lebarkan navigasi" : "Ciutkan navigasi"}
          >
            {rail ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        )}
        {!rail && (
          <>
            <div className="flex items-center justify-between gap-2 px-2">
              <WeekChip marker={weekMarker} period={weekPeriod} />
              <LocalClock className="text-xs text-muted" />
            </div>
            <p className="mt-3 truncate px-2 text-xs text-muted" title={email}>
              {email}
            </p>
            <SignOutButton className="mt-1 w-full justify-start" />
          </>
        )}
      </div>
    </aside>
  );
}
