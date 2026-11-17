import { weekNumberFor } from "../report-template";
import type { VocabDomain } from "../types";
import type { Point3 } from "./layout/run-layout-3d";
import { fieldOf, type MapPoint } from "./map-model";

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

/** Mean position of each field's visible terms, for the field labels. */
export function fieldCentres(
  points: readonly MapPoint[],
  coords: ReadonlyMap<string, Point3>,
  domains: ReadonlyMap<string, VocabDomain>,
): { field: VocabDomain; centre: Point3; count: number }[] {
  const sums = new Map<string, { field: VocabDomain; sum: Point3; count: number }>();
  for (const p of points) {
    const field = fieldOf(p.domain_id, domains);
    const at = coords.get(p.id);
    if (!field || !at) continue;
    const entry = sums.get(field.id) ?? { field, sum: [0, 0, 0] as Point3, count: 0 };
    for (let a = 0; a < 3; a++) entry.sum[a] += at[a];
    entry.count++;
    sums.set(field.id, entry);
  }
  return [...sums.values()].map(({ field, sum, count }) => ({ field, count, centre: sum.map((x) => x / count) as Point3 }));
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
