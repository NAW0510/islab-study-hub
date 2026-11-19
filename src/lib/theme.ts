/**
 * Light and dark theme.
 *
 * By default the app follows the device setting (`color-scheme: light dark`
 * on <html>). The theme button can pin one scheme: it sets `data-theme` on
 * <html> and remembers the choice in localStorage. Choosing the scheme the
 * device already uses forgets the choice, so the app follows the device again.
 *
 * THEME_SCRIPT runs in <head> before the first paint, so a pinned scheme
 * never flashes the other one. Print is always light (globals.css).
 */

export type Scheme = "light" | "dark";

export const THEME_STORAGE_KEY = "islab-theme";
/** Fired on window whenever the theme button (here or in another tab) changes the scheme. */
export const THEME_EVENT = "islab:theme";

const isScheme = (value: unknown): value is Scheme => value === "light" || value === "dark";

/** What to remember after choosing `choice`: nothing when the device already shows it. */
export function storedFor(choice: Scheme, systemDark: boolean): Scheme | null {
  return (choice === "dark") === systemDark ? null : choice;
}

/** The scheme in effect: a remembered choice wins over the device setting. */
export function resolveScheme(stored: unknown, systemDark: boolean): Scheme {
  return isScheme(stored) ? stored : systemDark ? "dark" : "light";
}

/** Inline <head> script: pins the remembered scheme before anything paints. No imports, no globals left behind. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

/** The scheme the page shows now (browser only). */
export function currentScheme(): Scheme {
  return resolveScheme(document.documentElement.dataset.theme, darkQuery().matches);
}

function pin(stored: Scheme | null) {
  const root = document.documentElement;
  if (stored) root.dataset.theme = stored;
  else delete root.dataset.theme;
}

/** Shows `choice`, remembers it (or forgets it when it matches the device) and tells the listeners. */
export function setScheme(choice: Scheme) {
  const stored = storedFor(choice, darkQuery().matches);
  pin(stored);
  try {
    if (stored) localStorage.setItem(THEME_STORAGE_KEY, stored);
    else localStorage.removeItem(THEME_STORAGE_KEY);
  } catch {
    // Storage blocked (private mode): the choice lasts for this page only.
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

/**
 * Calls `listener` whenever the scheme may have changed: the theme button,
 * the device setting, or the theme button in another tab. Returns the
 * unsubscribe function.
 */
export function onSchemeChange(listener: () => void) {
  const query = darkQuery();
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    pin(isScheme(event.newValue) ? event.newValue : null);
    listener();
  };
  query.addEventListener("change", listener);
  window.addEventListener(THEME_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    query.removeEventListener("change", listener);
    window.removeEventListener(THEME_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}
