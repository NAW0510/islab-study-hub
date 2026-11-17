import { weekNumberFor } from "../report-template";
import type { VocabDomain } from "../types";
import { LAYOUT_3D_CONFIG, LAYOUT_CONFIG } from "./layout/config";
import type { Point3 } from "./layout/run-layout-3d";
import { fieldOf, groupOf, type BoundaryLevel, type MapPoint } from "./map-model";

/** Pure helpers behind the 3D brain map: the browser cache, what is shown, and picking. */

// ── Cache ─────────────────────────────────────────────────────────────────
// The 3D layout is computed in the browser and kept in localStorage, so a
// second visit with the same terms appears at once without fetching vectors.

export const CACHE_KEY = "peta-otak-3d:v1";

export type Cached3d = {
  v: 1;
  fingerprint: string;
  unitsPerBox: number | null;
  coords: Record<string, Point3>;
};

/**
 * Changes whenever the set of terms or any term's embedding changes. Editing a
 * term's text clears its 2D position and the Edge Function places it again, so
 * the 2D coordinates double as an "embedding version". Domain changes do not
 * move anything in 3D and are left out.
 */
export function fingerprint(points: readonly Pick<MapPoint, "id" | "has_embedding" | "map_x" | "map_y">[]): string {
  const parts = points
    .map((p) => `${p.id}:${p.has_embedding ? 1 : 0}:${p.map_x?.toFixed(4) ?? "-"}:${p.map_y?.toFixed(4) ?? "-"}`)
    .sort();
  // Two FNV-1a hashes with different seeds: short, and collisions are practically impossible here.
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      const c = part.charCodeAt(i);
      a = Math.imul(a ^ c, 0x01000193);
      b = Math.imul(b ^ c, 0x01000193);
    }
    a = Math.imul(a ^ 0x2c, 0x01000193);
    b = Math.imul(b ^ 0x3b, 0x01000193);
  }
  return `${parts.length}-${(a >>> 0).toString(16)}${(b >>> 0).toString(16)}`;
}

const isPoint3 = (value: unknown): value is Point3 =>
  Array.isArray(value) && value.length === 3 && value.every((x) => typeof x === "number" && Number.isFinite(x));

/** Reads the cached layout; anything missing, unreadable or malformed counts as no cache. */
export function readCache(storage: Pick<Storage, "getItem"> | null | undefined): Cached3d | null {
  try {
    const raw = storage?.getItem(CACHE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Cached3d>;
    if (value.v !== 1 || typeof value.fingerprint !== "string" || !value.coords || typeof value.coords !== "object") return null;
    const coords: Record<string, Point3> = {};
    for (const [id, p] of Object.entries(value.coords)) if (isPoint3(p)) coords[id] = p;
    const unitsPerBox = typeof value.unitsPerBox === "number" && value.unitsPerBox > 0 ? value.unitsPerBox : null;
    return { v: 1, fingerprint: value.fingerprint, unitsPerBox, coords };
  } catch {
    return null;
  }
}

/** Saves the layout; a full or blocked storage is not an error (the map is simply computed again next time). */
export function writeCache(storage: Pick<Storage, "setItem"> | null | undefined, value: Omit<Cached3d, "v">): boolean {
  try {
    const coords: Record<string, Point3> = {};
    for (const [id, p] of Object.entries(value.coords)) coords[id] = p.map((x) => Number(x.toFixed(4))) as Point3;
    storage?.setItem(CACHE_KEY, JSON.stringify({ v: 1, ...value, coords }));
    return Boolean(storage);
  } catch {
    return false;
  }
}

// ── What is shown ─────────────────────────────────────────────────────────

/** Points with a 3D position, learned up to the end of `week`, whose field is not hidden. */
export function visible3d<T extends MapPoint>(
  points: readonly T[],
  coords: ReadonlyMap<string, Point3>,
  options: { programStart: string; week: number; hiddenFields: ReadonlySet<string>; domains: ReadonlyMap<string, VocabDomain> },
): T[] {
  return points.filter((p) => {
    if (!coords.has(p.id)) return false;
    if (weekNumberFor(options.programStart, p.learned_on) > options.week) return false;
    return !options.hiddenFields.has(fieldOf(p.domain_id, options.domains)?.id ?? "none");
  });
}

export type Group3d = {
  /** The field or branch the region stands for. */
  group: VocabDomain;
  /** Its top-level field, whose colour the region takes. */
  field: VocabDomain;
  members: Point3[];
  /** Mean position of the members, where the label goes. */
  centre: Point3;
};

/** Visible terms grouped by field or branch (the "Batas" choice), as in the 2D map. */
export function groups3d(
  points: readonly MapPoint[],
  coords: ReadonlyMap<string, Point3>,
  level: BoundaryLevel,
  domains: ReadonlyMap<string, VocabDomain>,
): Group3d[] {
  const groups = new Map<string, { group: VocabDomain; members: Point3[] }>();
  for (const p of points) {
    const group = groupOf(p, level, domains);
    const at = coords.get(p.id);
    if (!group || !at) continue;
    const entry = groups.get(group.id) ?? { group, members: [] };
    entry.members.push(at);
    groups.set(group.id, entry);
  }
  return [...groups.values()].map(({ group, members }) => {
    const centre: Point3 = [0, 0, 0];
    for (const m of members) for (let a = 0; a < 3; a++) centre[a] += m[a] / members.length;
    return { group, field: fieldOf(group.id, domains) ?? group, members, centre };
  });
}

// ── Regions ───────────────────────────────────────────────────────────────

const distance3 = (a: Point3, b: Point3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function quantile(sorted: readonly number[], q: number): number {
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

/**
 * The 2D rule (hull.ts) in 3D: drop points farther from the group's medoid
 * than Q3 + 1.5 × IQR of the distances, so one stray term does not inflate a
 * whole region. Groups under five points are kept whole.
 */
export function withoutOutliers3d(points: readonly Point3[], iqrFactor: number = LAYOUT_CONFIG.OUTLIER_IQR): Point3[] {
  if (points.length < 5) return [...points];
  let medoid = points[0];
  let best = Infinity;
  for (const candidate of points) {
    let total = 0;
    for (const other of points) total += distance3(candidate, other);
    if (total < best) {
      best = total;
      medoid = candidate;
    }
  }
  const distances = points.map((p) => distance3(p, medoid));
  const sorted = [...distances].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const limit = q3 + iqrFactor * (q3 - q1);
  return points.filter((_, i) => distances[i] <= limit);
}

/** `n` evenly spread unit directions (Fibonacci sphere); deterministic. */
export function sphereDirections(n: number): Point3[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: n }, (_, i) => {
    const y = n === 1 ? 0 : 1 - (2 * i) / (n - 1);
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    return [Math.cos(golden * i) * r, y, Math.sin(golden * i) * r];
  });
}

/**
 * The cloud a region's hull is wrapped around: every point puffed up into a
 * small sphere of directions, so one point gives a ball and two a capsule.
 */
export function paddedCloud3d(
  points: readonly Point3[],
  pad: number = LAYOUT_3D_CONFIG.REGION_PAD,
  directions: readonly Point3[] = sphereDirections(LAYOUT_3D_CONFIG.REGION_DIRECTIONS),
): Point3[] {
  return points.flatMap((p) => directions.map((d) => [p[0] + d[0] * pad, p[1] + d[1] * pad, p[2] + d[2] * pad] as Point3));
}

// ── Picking ───────────────────────────────────────────────────────────────

/** A point projected to the screen: pixels, plus depth (smaller = nearer the camera). */
export type Projected = { id: string; x: number; y: number; depth: number };

/**
 * The point under the pointer: the nearest on screen within `radius` pixels.
 * Points within `tie` pixels of that distance count as equally near, and of
 * those the one in front wins, so a point hidden behind another is not picked.
 */
export function pickNearest(projected: readonly Projected[], x: number, y: number, radius: number, tie = 4): Projected | null {
  let best = Infinity;
  const near: { p: Projected; d: number }[] = [];
  for (const p of projected) {
    if (p.depth < -1 || p.depth > 1) continue; // outside the view frustum
    const d = Math.hypot(p.x - x, p.y - y);
    if (d > radius) continue;
    near.push({ p, d });
    if (d < best) best = d;
  }
  const candidates = near.filter(({ d }) => d <= best + tie).sort((a, b) => a.p.depth - b.p.depth || a.d - b.d);
  return candidates[0]?.p ?? null;
}
