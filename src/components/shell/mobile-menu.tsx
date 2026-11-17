"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Menu, X } from "lucide-react";
import { Shape } from "@/components/shape";
import { cn } from "@/lib/utils";
import { LocalClock } from "./local-clock";
import { isActivePath, NAV_ITEMS, navNumber } from "./nav-items";
import { Brand, SignOutButton, WeekChip } from "./parts";
import type { ShellProps } from "./sidebar";
import { ThemeToggle } from "./theme-toggle";

/**
 * Phone navigation: a slim top bar and a full-screen menu of numbered
 * sections, each with its shape. The menu is a native modal <dialog>, which
 * traps focus, closes on Esc and returns focus to the "Menu" button. Hidden
 * on desktop (see Sidebar) and in print.
 */
export function MobileMenu({ email, weekMarker, weekPeriod }: ShellProps) {
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Close after navigating (also covers back/forward).
  useEffect(() => {
    dialogRef.current?.close();
  }, [pathname]);

  return (
    <header data-shell-header className="sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur md:hidden print:!hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <Brand />
        <div className="flex items-center gap-2">
          <WeekChip marker={weekMarker} period={weekPeriod} className="max-[22rem]:hidden" />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            aria-haspopup="dialog"
            onClick={() => dialogRef.current?.showModal()}
          >
            <Menu className="size-4" />
            Menu
          </button>
        </div>
      </div>

      <dialog ref={dialogRef} className="mobile-menu" aria-label="Menu">
        <div className="flex min-h-dvh flex-col px-5 pt-3 pb-6">
          <div className="flex items-center justify-between">
            <p className="eyebrow">Menu</p>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <form method="dialog">
                <button type="submit" className="btn btn-secondary btn-sm">
                  <X className="size-4" />
                  Tutup
                </button>
              </form>
            </div>
          </div>

          <nav className="mt-6" aria-label="Navigasi utama">
            {NAV_ITEMS.map(({ href, label, shape, color }, i) => {
              const active = isActivePath(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  prefetch
                  aria-current={active ? "page" : undefined}
                  onClick={() => dialogRef.current?.close()}
                  className="flex items-center gap-4 border-b border-border py-4"
                >
                  <span className="nav-number w-6 text-xs" aria-hidden="true">
                    {navNumber(i)}
                  </span>
                  <span className={cn("display flex-1 text-[1.75rem]", active ? "text-text" : "text-muted")}>{label}</span>
                  <Shape kind={shape} color={color} className={cn("size-4", !active && "opacity-40")} />
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto pt-8">
            <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
              <WeekChip marker={weekMarker} period={weekPeriod} />
              <LocalClock className="font-display text-xs text-muted" />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-xs text-muted" title={email}>
                {email}
              </p>
              <SignOutButton className="shrink-0" />
            </div>
          </div>
        </div>
      </dialog>
    </header>
  );
}
