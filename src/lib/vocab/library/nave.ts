/**
 * The width of the Perpustakaan's nave (world/library.ts), as a pure function
 * so the rule can be tested.
 *
 * The galleries (slab, rails and balusters) stand GALLERY_DEPTH units inside
 * the nave's walls. The river of sheets must stay clear of them, also when a
 * sheet folds back into the fog, so the nave's half-width is at least half
 * the river plus the gallery and some air (CLEARANCE).
 */

/** How far the galleries reach into the nave, in units (U = a ninth of the viewport height). */
export const GALLERY_DEPTH = 1;
/** Air between the river's edge and the inner face of a gallery rail, in units. */
export const CLEARANCE = 0.35;
/** The nave is never narrower than this share of the canvas width (a phone's column fills the screen). */
export const MIN_SHARE_OF_VIEW = 0.3;

/** Half-width of the nave in CSS px, measured from its centre line to the inside of the walls. */
export function naveHalfWidth(viewWidth: number, viewHeight: number, riverWidth: number): number {
  const unit = viewHeight / 9;
  return Math.max(viewWidth * MIN_SHARE_OF_VIEW, riverWidth / 2 + (GALLERY_DEPTH + CLEARANCE) * unit);
}

/** Where the inner face of a gallery rail stands, from the centre line (CSS px). */
export function railInnerEdge(nave: number, viewHeight: number): number {
  return nave - GALLERY_DEPTH * (viewHeight / 9);
}
