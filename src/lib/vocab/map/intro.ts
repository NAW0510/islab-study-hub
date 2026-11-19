/**
 * Intros of the Peta Otak views, as pure rules (after the entrance protocol
 * of labmgm.org's Articles page): a fresh visit plays the full intro, a view
 * already seen in this browser session (or a switch between views) plays a
 * short one, reduced motion plays none. Any input skips straight to the end,
 * so an intro never stands between the reader and the map.
 */

export type IntroKind = "full" | "short" | "instant";

/** Session storage key of the views whose full intro has played. */
export const INTRO_SEEN_KEY = "islab-peta-intro";

export function introKind(options: { seen: boolean; switching: boolean; reducedMotion: boolean }): IntroKind {
  if (options.reducedMotion) return "instant";
  return options.seen || options.switching ? "short" : "full";
}

/** Durations in milliseconds per kind (a view may stretch the full one). */
export const INTRO_MS = { full: 3000, short: 800, instant: 0 } as const;

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** How far along the part [from, to] of the intro is at overall progress t (0…1). */
export function segment(t: number, from: number, to: number): number {
  return to <= from ? (t >= to ? 1 : 0) : clamp01((t - from) / (to - from));
}

export const easeOutCubic = (x: number) => 1 - (1 - x) ** 3;
export const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
/** Settles with a small overshoot (the brain's spin landing). */
export const easeOutBack = (x: number) => {
  const c = 1.4;
  return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2;
};

/** Views whose full intro already played in this session, from storage (tolerates junk). */
export function seenViews(stored: string | null): Set<string> {
  if (!stored) return new Set();
  try {
    const value: unknown = JSON.parse(stored);
    return new Set(Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}
