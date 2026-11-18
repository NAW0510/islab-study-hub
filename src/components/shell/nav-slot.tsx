"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** The element in the top bar's second row that pages fill (navbar.tsx). */
export const NAV_SLOT_ID = "nav-slot";

const noop = () => () => {};

/**
 * Puts a page's own switches (Daftar/Kartu, the 3D views, a subject's tabs)
 * into the top bar's second row, next to the section's tabs, so they read as
 * part of the bar. On a client navigation they land there in the same
 * commit. On a full load the server cannot reach the bar, so `fallback`
 * (usually the same switch, styled for the page) shows in place until
 * hydration moves it up.
 */
export function NavSlot({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const target = useSyncExternalStore(
    noop,
    () => document.getElementById(NAV_SLOT_ID),
    () => null,
  );
  return target ? createPortal(children, target) : fallback;
}
