import { polygonArea, polygonCentroid, polygonContains } from "d3-polygon";
import { paddedHull, placeGuests, withoutOutliers } from "../../vocab/hull";
import type { Point } from "../../vocab/layout/normalize";

/**
 * The flat Peta Otak as the tablet's hologram draws it: the same positions
 * (map_x, map_y in the map's [-1, 1] square, y up) and the same field
 * regions as the 2D page (padded hulls, outliers left out; a term that also
 * belongs to a field is taken inside it only when it lies close, as
 * placeGuests decides), scaled onto a plane of `size` world
 * units and smoothed into closed curves. Pure: the hologram, its picking and
 * the SVG fallback all use it.
 */

export type PlaneTerm = { id: string; term: string; fieldId: string | null; x: number; y: number };
export type PlaneRegion = { fieldId: string; ring: Point[]; center: Point; count: number };

type Input = { id: string; term: string; map_x: number | null; map_y: number | null };

/** Closed uniform Catmull-Rom through `points`, `samples` points in all. */
export function smoothClosed(points: readonly Point[], samples: number): Point[] {
  const n = points.length;
  if (n < 3) return [...points];
  const out: Point[] = [];
  for (let s = 0; s < samples; s++) {
    const u = (s / samples) * n;
    const i = Math.floor(u);
    const t = u - i;
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i % n];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    const t2 = t * t;
    const t3 = t2 * t;
    const c = (a: number, b: number, d: number, e: number) => 0.5 * (2 * b + (-a + d) * t + (2 * a - 5 * b + 4 * d - e) * t2 + (-a + 3 * b - 3 * d + e) * t3);
    out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
  }
  return out;
}

export function mapToPlane<T extends Input>(
  points: readonly T[],
  /** A term's fields, its primary field first (empty: no domain). */
  fieldsOf: (point: T) => readonly string[],
  size: number,
  samples: number,
): { terms: PlaneTerm[]; regions: PlaneRegion[] } {
  const half = size / 2;
  const placed = points.filter((p) => p.map_x !== null && p.map_y !== null);
  const terms: PlaneTerm[] = placed.map((p) => ({
    id: p.id,
    term: p.term,
    fieldId: fieldsOf(p)[0] ?? null,
    x: (p.map_x as number) * half,
    y: (p.map_y as number) * half,
  }));
  const members = new Map<string, Point[]>();
  const pinned = new Map<string, Point[]>();
  for (const p of placed) {
    const at: Point = [p.map_x as number, p.map_y as number];
    fieldsOf(p).forEach((field, i) => {
      const bucket = i === 0 ? members : pinned;
      const list = bucket.get(field);
      if (list) list.push(at);
      else bucket.set(field, [at]);
    });
  }
  const regions: PlaneRegion[] = [];
  for (const [fieldId, own] of members) {
    const guests = placeGuests(own, pinned.get(fieldId) ?? []).pinned;
    const hull = paddedHull([...withoutOutliers(own), ...guests]);
    if (!hull || hull.length < 3) continue;
    const ring = smoothClosed(hull, samples).map(([x, y]): Point => [x * half, y * half]);
    const [cx, cy] = polygonCentroid(hull);
    regions.push({ fieldId, ring, center: [cx * half, cy * half], count: own.length + guests.length });
  }
  return { terms, regions };
}

/** The term nearest (x, y) within `reach`, in plane units; null when none is that close. */
export function nearestTerm(terms: readonly PlaneTerm[], x: number, y: number, reach: number): PlaneTerm | null {
  let best: PlaneTerm | null = null;
  let bestD = reach * reach;
  for (const t of terms) {
    const d = (t.x - x) ** 2 + (t.y - y) ** 2;
    if (d <= bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

/** The field whose region holds (x, y); the smallest region wins where they overlap. */
export function regionAt(regions: readonly PlaneRegion[], x: number, y: number): PlaneRegion | null {
  let best: PlaneRegion | null = null;
  let bestArea = Infinity;
  for (const r of regions) {
    if (!polygonContains(r.ring, [x, y])) continue;
    const area = Math.abs(polygonArea(r.ring));
    if (area < bestArea) {
      bestArea = area;
      best = r;
    }
  }
  return best;
}
