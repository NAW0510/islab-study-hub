type WorldModules = [typeof import("./world/engine"), typeof import("./world/layers")];

let loading: Promise<WorldModules> | null = null;

/**
 * The Perpustakaan's WebGL world (three.js and the scene), loaded once and
 * shared: the page's world host waits on it, and links heading to the
 * Perpustakaan start it early, so the world is usually ready when the page
 * arrives. A failed load is forgotten, so the next try starts afresh.
 */
export function loadLibraryWorld(): Promise<WorldModules> {
  if (!loading) {
    loading = Promise.all([import("./world/engine"), import("./world/layers")]);
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

/**
 * Starts loading the world on intent (pointer over, focus on or press of a
 * link to the Perpustakaan) or when idle on a Kosakata page, after MGM's
 * portal. Skipped where the world would not run (reduced motion) or where
 * data is to be saved.
 */
export function preloadLibraryWorld() {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
  loadLibraryWorld().catch(() => {});
}
