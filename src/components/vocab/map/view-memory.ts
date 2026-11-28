/**
 * The Peta Otak 3D's remembered choices, shared by its full screen
 * (brain-map-3d.tsx) and the Istilah Teknis tablet's hologram, so both open
 * on the view (and the Kubus's canvas theme) chosen last in either.
 */
export const VIEW_KEY = "peta-otak-3d:tampilan";
export const THEME_KEY = "peta-otak-3d:tema";

export function remembered<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const saved = window.localStorage.getItem(key);
    if (saved && (allowed as readonly string[]).includes(saved)) return saved as T;
  } catch {
    // no storage: use the default
  }
  return fallback;
}

export function remember(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // remembering a choice is a convenience only
  }
}
