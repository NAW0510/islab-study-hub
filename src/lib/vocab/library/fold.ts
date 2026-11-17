import { LIBRARY_CONFIG } from "./config";

/**
 * The river's shape, in screen space (CSS px, y down from the top of the
 * viewport). The sheet shader (world/card-shaders.ts) computes exactly this
 * per vertex; these JS twins are what the tests pin down.
 */
const { SWELL, SWELL_WAVELENGTH, SWELL_PERIOD, FOLD_GAP, FOLD_ZONE, FOLD_DEPTH } = LIBRARY_CONFIG.sheet;

/** Where the fold line sits: a little under the head's bottom. */
export function foldLine(headBottom: number, viewportHeight: number): number {
  return headBottom + FOLD_GAP * viewportHeight;
}

/** 0 below the fold line, rising smoothly to 1 a fold zone above it. */
export function foldAmount(y: number, headBottom: number, viewportHeight: number): number {
  const above = foldLine(headBottom, viewportHeight) - y;
  if (above <= 0) return 0;
  const t = Math.min(1, above / (FOLD_ZONE * viewportHeight));
  return t * t * (3 - 2 * t);
}

/** How far back (positive = away from the camera) a point at fold amount t sits; accelerating so the roll reads. */
export function foldDepth(t: number): number {
  return FOLD_DEPTH * t * t;
}

/** The slow diagonal swell toward the camera at a screen point and time (seconds). */
export function swell(x: number, y: number, time: number): number {
  const phase = ((x + y) / SWELL_WAVELENGTH) * Math.PI * 2 - (time / SWELL_PERIOD) * Math.PI * 2;
  return SWELL * 0.5 * (1 + Math.sin(phase));
}
