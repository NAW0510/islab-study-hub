import { ViewTransition, type ReactElement } from "react";

/*
 * View transitions at the important moments (docs/DESIGN_SYSTEM.md › Gerak
 * dan transisi; the classes live in globals.css). They only run inside React
 * transitions (navigations, server actions, startTransition), never block
 * input, and are instant with reduced motion.
 */

/**
 * The same thing on a card and on its own page (a title): it travels between
 * them when the page opens, and back. `name` must be unique on a page.
 */
export function SharedTitle({ name, children }: { name: string; children: ReactElement }) {
  return (
    <ViewTransition name={name} share="vt-morph" default="none">
      {children}
    </ViewTransition>
  );
}

/**
 * An item of a list that people add to, remove from or reorder: a new item
 * rises into its place, a removed one fades, and (with `glide`, for short
 * lists) the others glide to their new places instead of jumping. Long lists
 * (Kosakata) leave `glide` off, so one new term does not move hundreds.
 */
export function ListItemMotion({ glide = true, children }: { glide?: boolean; children: ReactElement }) {
  return (
    <ViewTransition enter="vt-item-in" exit="vt-item-out" update={glide ? "vt-morph" : "none"} default="none">
      {children}
    </ViewTransition>
  );
}

/**
 * A view that replaces another in the same place (Daftar ↔ Kartu): give it a
 * `key` per view and change the view inside a transition; the old view fades
 * out as the new one fades in.
 */
export function ViewSwap({ children }: { children: ReactElement }) {
  return (
    <ViewTransition enter="vt-swap" exit="vt-swap" default="none">
      {children}
    </ViewTransition>
  );
}

/**
 * Content that changes in place (a tab, a view): a quick crossfade, inside a
 * transition. Wrap the container that keeps its place.
 */
export function SwapMotion({ children }: { children: ReactElement }) {
  return (
    <ViewTransition update="vt-swap" default="none">
      {children}
    </ViewTransition>
  );
}

/** A marker that slides between choices (the active tab or view). Unique `name` per page. */
export function SlidingMarker({ name, children }: { name: string; children: ReactElement }) {
  return (
    <ViewTransition name={name} share="vt-morph" default="none">
      {children}
    </ViewTransition>
  );
}
