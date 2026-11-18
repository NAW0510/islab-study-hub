"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ViewTransition } from "react";
import { RollText } from "@/components/roll-text";
import { Shape } from "@/components/shape";
import { SlideGroup } from "@/components/slide-group";
import { MapViewSwitch } from "@/components/vocab/map/map-view-switch";
import { VocabTabs } from "@/components/vocab/vocab-tabs";
import { APP_NAME } from "@/lib/constants";
import { BrandMark } from "./brand-mark";
import { LocalClock } from "./local-clock";
import { NavMenu } from "./nav-menu";
import { isActivePath, isImmersive, NAV_ITEMS, navNumber, subNavFor } from "./nav-items";
import { NAV_SLOT_ID } from "./nav-slot";
import { AccountMenu, WeekChip } from "./parts";
import { ThemeToggle } from "./theme-toggle";

export type ShellProps = {
  email: string;
  /** e.g. "Week 07" */
  weekMarker: string;
  /** e.g. "9 Nov – 15 Nov 2026" */
  weekPeriod: string;
};

/**
 * The current section's shape. It is named for view transitions, so on
 * navigation it travels from the old link to the new one (and turns into the
 * new section's shape on the way), while the raised pill slides under the
 * links (SlideGroup).
 */
function ActiveShape({ children }: { children: React.ReactElement }) {
  return (
    <ViewTransition name="nav-active" share="vt-morph" default="none">
      {children}
    </ViewTransition>
  );
}

/**
 * The app's top bar, on every page (it never moves between pages; only the
 * content under it changes). Glass: frosted over pages, nearly clear over the
 * Perpustakaan and the Peta Otak, whose worlds show through.
 *
 * Row 1: the mark, the six numbered sections (from 1024 px; a full-screen
 * menu below that), the Week, the clock, the theme and the account.
 * Row 2, only when there is something for it: the section's own tabs and
 * view switches (from the route), then whatever the page puts in its slot.
 */
export function Navbar({ email, weekMarker, weekPeriod }: ShellProps) {
  const pathname = usePathname();
  const sub = subNavFor(pathname);

  return (
    <header data-shell-header data-immersive={isImmersive(pathname) || undefined} className="navbar theme-scope print:!hidden">
      <div className="navbar-row">
        <Link href="/" className="navbar-brand" aria-label={`${APP_NAME}, ke dashboard`}>
          <BrandMark size="sm" />
          <span className="lg:hidden xl:inline">{APP_NAME}</span>
        </Link>

        <nav aria-label="Navigasi utama" className="navbar-links">
          <SlideGroup className="nav-slide">
            {NAV_ITEMS.map(({ href, label, short, shape, color }, i) => {
              const active = isActivePath(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  prefetch
                  aria-current={active ? "page" : undefined}
                  title={short !== label ? label : undefined}
                  className="nav-link"
                >
                  <span className="nav-number" aria-hidden="true">
                    {navNumber(i)}
                  </span>
                  <RollText>{short}</RollText>
                  {/* Every link keeps room for its shape, so the row never shifts when the page changes. */}
                  {active ? (
                    <ActiveShape>
                      <Shape kind={shape} color={color} className="nav-shape size-2.5" />
                    </ActiveShape>
                  ) : (
                    <Shape kind={shape} color={color} className="nav-shape size-2.5" />
                  )}
                </Link>
              );
            })}
          </SlideGroup>
        </nav>

        <div className="navbar-tools">
          <WeekChip marker={weekMarker} period={weekPeriod} className="max-[22rem]:hidden" />
          <LocalClock className="hidden font-display text-xs text-muted xl:inline" />
          <ThemeToggle className="hidden lg:inline-flex" />
          <AccountMenu email={email} className="hidden lg:inline-flex" />
          <NavMenu email={email} weekMarker={weekMarker} weekPeriod={weekPeriod} className="lg:hidden" />
        </div>
      </div>

      <div className="navbar-sub">
        <div className="navbar-sub-row no-scrollbar">
          {sub && <VocabTabs active={sub.vocab} />}
          {sub?.map && <MapViewSwitch active={sub.map} />}
          {/* Switches that hold the page's own state (Daftar/Kartu, the 3D views, a subject's tabs). */}
          <div id={NAV_SLOT_ID} className="navbar-slot" />
        </div>
      </div>
    </header>
  );
}
