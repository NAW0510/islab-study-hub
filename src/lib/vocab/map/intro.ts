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
/** Quick to start, a long gentle landing: a spin winding down. */
export const easeOutQuart = (x: number) => 1 - (1 - x) ** 4;
export const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

/** How a 3D view's camera comes in (scenes/registry.ts › intro). */
export type IntroPath = {
  /** How many times its framed distance the camera starts at. */
  dolly: number;
  /** How far round it starts, radians (it turns the way "Putar otomatis" does). */
  orbit: number;
  /** How much higher it starts, radians. */
  rise: number;
};

/**
 * Where the camera is on its way in at progress t: its distance as a
 * multiple of the frame's, and how far round and how much higher than the
 * frame it still is. The zoom is slow, then steady, then slow; the turn is
 * quickest at first and winds down. Everything lands on the frame at t = 1
 * with no speed left, so the view hands over to "Putar otomatis" smoothly.
 */
export function introCamera(t: number, path: IntroPath): { distance: number; azimuth: number; elevation: number } {
  const x = clamp01(t);
  const away = 1 - easeInOutCubic(x);
  return {
    distance: 1 + (path.dolly - 1) * away,
    azimuth: path.orbit * (1 - easeOutCubic(x)),
    elevation: path.rise * away,
  };
}

/** A short intro's path: the same way in, a fifth of the distance and a sixth of the turn. */
export function shortPath(path: IntroPath): IntroPath {
  return { dolly: 1 + (path.dolly - 1) * 0.2, orbit: path.orbit / 6, rise: path.rise / 6 };
}

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
