"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** The elements in the top bar's second row that pages fill (navbar.tsx): after the section's tabs, and at the far end. */
export const NAV_SLOT_ID = "nav-slot";
export const NAV_SLOT_END_ID = "nav-slot-end";

const noop = () => () => {};

/**
 * Puts a page's own controls into the top bar's second row, so they read as
 * part of the bar: switches next to the section's tabs (`start`: Daftar/
 * Kartu, the 3D views, a subject's tabs) or tools at the far end (`end`: the
 * Peta Otak's search, boundaries, motion and info). On a client navigation
 * they land there in the same commit. On a full load the server cannot reach
 * the bar, so `fallback` (if any) shows in place until hydration moves it up.
 */
export function NavSlot({ children, fallback = null, place = "start" }: { children: ReactNode; fallback?: ReactNode; place?: "start" | "end" }) {
  const id = place === "end" ? NAV_SLOT_END_ID : NAV_SLOT_ID;
  const target = useSyncExternalStore(
    noop,
    () => document.getElementById(id),
    () => null,
  );
  return target ? createPortal(children, target) : fallback;
}
