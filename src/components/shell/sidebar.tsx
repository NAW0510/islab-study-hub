"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, ViewTransition } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { RollText } from "@/components/roll-text";
import { Shape } from "@/components/shape";
import { cn } from "@/lib/utils";
import { BrandMark } from "./brand-mark";
import { LocalClock } from "./local-clock";
import { isActivePath, NAV_ITEMS, navNumber } from "./nav-items";
import { Brand, SignOutButton, WeekChip } from "./parts";
import { ThemeToggle } from "./theme-toggle";

export type ShellProps = {
  email: string;
  /** e.g. "Week 07" */
  weekMarker: string;
  /** e.g. "9 Nov – 15 Nov 2026" */
  weekPeriod: string;
};

/** Pages that want the whole screen: the sidebar folds into a rail of numbers there. */
const IMMERSIVE = ["/vocab/perpustakaan"];

/**
 * The current page's shape. It is named for view transitions, so on
 * navigation it travels from the old item to the new one (and turns into the
 * new section's shape on the way). Only the desktop sidebar names it: the
 * phone menu never shows at the same time.
 */
function ActiveShape({ children }: { children: React.ReactElement }) {
  return (
    <ViewTransition name="nav-active" share="vt-morph" default="none">
      {children}
    </ViewTransition>
  );
}

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
        "sidebar sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border py-6 md:flex print:!hidden",
        rail ? "w-[4.5rem] items-center px-2" : "w-64 px-4",
      )}
    >
      <div className={cn("flex items-center", rail ? "justify-center" : "px-2")}>
        {rail ? (
          <Link href="/" aria-label="IS Lab Study Hub, ke dashboard" title="Dashboard">
            <BrandMark />
          </Link>
        ) : (
          <Brand />
        )}
      </div>

      <nav className="mt-9 flex flex-col gap-1" aria-label="Navigasi utama">
        {NAV_ITEMS.map(({ href, label, shape, color }, i) => {
          const active = isActivePath(pathname, href);
          const mark = rail ? (
            <Shape kind={shape} color={color} className="nav-shape absolute top-1.5 right-1.5 size-1.5" />
          ) : (
            <Shape kind={shape} color={color} className="nav-shape size-3" />
          );
          return (
            <Link
              key={href}
              href={href}
              prefetch
              aria-current={active ? "page" : undefined}
              aria-label={rail ? label : undefined}
              title={rail ? label : undefined}
              className={cn("nav-item", rail && "nav-rail")}
            >
              <span className={cn("nav-number", !rail && "w-5")} aria-hidden="true">
                {navNumber(i)}
              </span>
              {!rail && (
                <span className="min-w-0 flex-1">
                  <RollText>{label}</RollText>
                </span>
              )}
              {active ? <ActiveShape>{mark}</ActiveShape> : !rail && mark}
            </Link>
          );
        })}
      </nav>

      <div className={cn("mt-auto", rail ? "flex flex-col items-center gap-2" : "flex flex-col gap-3 px-2")}>
        {rail ? (
          <>
            <ThemeToggle />
            <button
              type="button"
              className="icon-btn"
              onClick={() => setOpenedOn(pathname)}
              aria-label="Lebarkan navigasi"
              title="Lebarkan navigasi"
            >
              <PanelLeftOpen className="size-4" />
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <WeekChip marker={weekMarker} period={weekPeriod} />
              <LocalClock className="font-display text-xs text-muted" />
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
              <p className="min-w-0 truncate text-xs text-muted" title={email}>
                {email}
              </p>
              <ThemeToggle className="shrink-0" />
            </div>
            <div className="-mx-2 flex items-center justify-between gap-2">
              <SignOutButton />
              {immersive && (
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setOpenedOn(null)}
                  aria-label="Ciutkan navigasi"
                  title="Ciutkan navigasi"
                >
                  <PanelLeftClose className="size-4" />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
