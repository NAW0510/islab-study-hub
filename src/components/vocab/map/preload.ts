/**
 * Starts loading the 3D Peta Otak (three.js and its scenes) when someone
 * heads for it (pointer over, focus on or press of the 3D link), so its
 * canvas and intro start sooner. The same chunk brain-map-3d-loader.tsx
 * loads; skipped where data is to be saved.
 */
export function preloadMap3d() {
  if (typeof window === "undefined") return;
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
  import("./brain-map-3d").catch(() => {});
}
