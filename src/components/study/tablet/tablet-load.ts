/**
 * The Istilah Teknis tablet's late loads: its UI (terms-tablet.tsx) and its
 * scene (tablet.ts, with three.js). Heading for the Istilah Teknis book
 * (pointer over, focus, press) or idling on the books shelf starts both, so
 * the book can lift off its sheet the moment it is opened. The UI is loaded
 * by hand rather than through next/dynamic: a Suspense boundary holds new
 * content back for about 300 ms after its fallback. Failures reset.
 */
let engine: Promise<typeof import("./tablet")> | null = null;
let ui: Promise<typeof import("./terms-tablet")> | null = null;

export function loadTablet(): Promise<typeof import("./tablet")> {
  engine ??= import("./tablet").catch((error) => {
    engine = null;
    throw error;
  });
  return engine;
}

export function loadTabletUi(): Promise<typeof import("./terms-tablet")> {
  ui ??= import("./terms-tablet").catch((error) => {
    ui = null;
    throw error;
  });
  return ui;
}

/** Warm both, unless the visitor asked to save data; the scene is skipped under reduced motion. */
export function preloadTablet() {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return;
  void loadTabletUi().catch(() => undefined);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  void loadTablet().catch(() => undefined);
}
