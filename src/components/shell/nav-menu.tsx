"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Menu, X } from "lucide-react";
import { Shape } from "@/components/shape";
import { cn } from "@/lib/utils";
import { LocalClock } from "./local-clock";
import { isActivePath, NAV_ITEMS, navNumber } from "./nav-items";
import type { ShellProps } from "./navbar";
import { SignOutButton, WeekChip } from "./parts";
import { ThemeToggle } from "./theme-toggle";

/**
 * The top bar's "Menu" below 1024 px: a full-screen menu of numbered
 * sections, each with its shape. The menu is a native modal <dialog>, which
 * traps focus, closes on Esc and returns focus to the button.
 */
export function NavMenu({ email, weekMarker, weekPeriod, className }: ShellProps & { className?: string }) {
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Close after navigating (also covers back/forward).
  useEffect(() => {
    dialogRef.current?.close();
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        className={cn("btn btn-secondary btn-sm", className)}
        aria-haspopup="dialog"
        onClick={() => dialogRef.current?.showModal()}
      >
        <Menu className="size-4" />
        Menu
      </button>

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
    </>
  );
}
