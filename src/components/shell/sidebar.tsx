"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RollText } from "@/components/roll-text";
import { cn } from "@/lib/utils";
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

/** Desktop navigation. Hidden on phones (see MobileMenu) and in print. */
export function Sidebar({ email, weekMarker, weekPeriod }: ShellProps) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border px-4 py-5 md:flex print:!hidden">
      <div className="px-2">
        <Brand />
      </div>

      <nav className="mt-8 flex flex-col gap-0.5" aria-label="Navigasi utama">
        {NAV_ITEMS.map(({ href, label }, i) => {
          const active = isActivePath(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              prefetch
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-control px-3 py-2 text-sm font-medium transition-colors duration-(--dur-fast)",
                active ? "bg-surface-2 text-text" : "text-muted hover:bg-surface-2 hover:text-text",
              )}
            >
              <span className="w-5 font-display text-[11px] text-muted tabular-nums" aria-hidden="true">
                {navNumber(i)}
              </span>
              <RollText>{label}</RollText>
              {active && <span className="ml-auto size-1.5 rounded-full bg-accent" />}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-border pt-4">
        <div className="flex items-center justify-between gap-2 px-2">
          <WeekChip marker={weekMarker} period={weekPeriod} />
          <LocalClock className="text-xs text-muted" />
        </div>
        <p className="mt-3 truncate px-2 text-xs text-muted" title={email}>
          {email}
        </p>
        <SignOutButton className="mt-1 w-full justify-start" />
      </div>
    </aside>
  );
}
