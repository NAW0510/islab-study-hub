import { polygonCentroid, polygonHull } from "d3-polygon";
import { curveCatmullRomClosed, line } from "d3-shape";
import { LAYOUT_CONFIG } from "./layout/config";
import type { Point } from "./layout/normalize";

/** Region outlines for the brain map: a padded, smoothed hull around a domain's points. */

const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function quantile(sorted: readonly number[], q: number): number {
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

/**
 * Drops points that sit unusually far from the group's medoid (the member
 * closest to all others): farther than Q3 + 1.5 × IQR of the distances.
 * One stray term must not inflate a whole region. Small groups are kept whole.
 */
export function withoutOutliers(points: readonly Point[], iqrFactor: number = LAYOUT_CONFIG.OUTLIER_IQR): Point[] {
  if (points.length < 5) return [...points];

  let medoid = points[0];
  let best = Infinity;
  for (const candidate of points) {
    let total = 0;
    for (const other of points) total += distance(candidate, other);
    if (total < best) {
      best = total;
      medoid = candidate;
    }
  }

  const distances = points.map((p) => distance(p, medoid));
  const sorted = [...distances].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const limit = q3 + iqrFactor * (q3 - q1);
  return points.filter((_, i) => distances[i] <= limit);
}

/**
 * Convex hull around the points after each one is puffed up into a small
 * circle. Works for a single point (a circle) and two points (a capsule).
 */
export function paddedHull(
  points: readonly Point[],
  pad: number = LAYOUT_CONFIG.HULL_PAD,
  segments: number = LAYOUT_CONFIG.HULL_SEGMENTS,
): Point[] | null {
  if (points.length === 0) return null;
  const ring: Point[] = [];
  for (const [x, y] of points) {
    for (let i = 0; i < segments; i++) {
      const angle = (2 * Math.PI * i) / segments;
      ring.push([x + pad * Math.cos(angle), y + pad * Math.sin(angle)]);
    }
  }
  return polygonHull(ring);
}

const smooth = line<Point>()
  .x((p) => p[0])
  .y((p) => p[1])
  .curve(curveCatmullRomClosed);

export type Region = {
  /** SVG path in the coordinates given by `project`. */
  path: string;
  /** Where the label goes (polygon centroid), in the same coordinates. */
  center: Point;
  /** How many points are inside the outline's group (outliers included). */
  count: number;
};

/**
 * Outline for one domain's points. `project` maps map coordinates to screen
 * coordinates (the map's y axis points up, the screen's down). `pinned`
 * points are always inside (never trimmed as outliers): the terms that also
 * belong here although their position is elsewhere (one term, many domains).
 */
export function regionFor(
  points: readonly Point[],
  project: (p: Point) => Point = (p) => p,
  pinned: readonly Point[] = [],
): Region | null {
  const hull = paddedHull([...withoutOutliers(points), ...pinned]);
  if (!hull) return null;
  const projected = hull.map(project);
  const path = smooth(projected);
  if (!path) return null;
  // The closed curve returns to its start without a close command; "Z" joins the stroke cleanly there.
  return { path: `${path}Z`, center: polygonCentroid(projected), count: points.length + pinned.length };
}

/** The member of `points` closest to `from`, with its distance; null for no points. */
export function nearestPoint(from: Point, points: readonly Point[]): { point: Point; distance: number } | null {
  let best: { point: Point; distance: number } | null = null;
  for (const p of points) {
    const d = distance(from, p);
    if (!best || d < best.distance) best = { point: p, distance: d };
  }
  return best;
}

/**
 * A narrow tendril from a region's nearest member to a term that also
 * belongs to it but sits far away: a padded capsule around the two points.
 */
export function bridgeFor(
  from: Point,
  to: Point,
  project: (p: Point) => Point = (p) => p,
  pad: number = LAYOUT_CONFIG.HULL_PAD * LAYOUT_CONFIG.BRIDGE_PAD_SHARE,
): string | null {
  const hull = paddedHull([from, to], pad);
  if (!hull) return null;
  const path = smooth(hull.map(project));
  return path ? `${path}Z` : null;
}

/**
 * How a domain's region takes in a guest (a term of the domain that sits
 * elsewhere): close enough → inside the outline (a true overlap); farther →
 * a tendril reaches out to it instead of stretching the whole region.
 */
export function placeGuests(members: readonly Point[], guests: readonly Point[], reach: number = LAYOUT_CONFIG.HULL_PAD * LAYOUT_CONFIG.OVERLAP_REACH) {
  const pinned: Point[] = [];
  const bridges: [Point, Point][] = [];
  for (const guest of guests) {
    const near = nearestPoint(guest, members);
    if (!near || near.distance <= reach) pinned.push(guest);
    else bridges.push([near.point, guest]);
  }
  return { pinned, bridges };
}
