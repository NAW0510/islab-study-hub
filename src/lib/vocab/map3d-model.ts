import { weekNumberFor } from "../report-template";
import type { VocabDomain } from "../types";
import { LAYOUT_3D_CONFIG, LAYOUT_CONFIG } from "./layout/config";
import type { Point3 } from "./layout/run-layout-3d";
import type { BrainLayout } from "./brain-model";
import { fieldOf, groupOf, type BoundaryLevel, type MapPoint } from "./map-model";
import type { Role } from "./space-model";

/** Pure helpers behind the 3D brain map: the browser cache, what is shown, and picking. */

// ── Cache ─────────────────────────────────────────────────────────────────
// Everything the 3D views need is computed in the browser (in a Web Worker)
// and kept in localStorage, so a second visit with the same terms and domains
// appears at once without fetching vectors.

export const CACHE_KEY = "peta-otak-3d:v1";

/**
 * Version of the layout models (space roles, brain anatomy). Part of the
 * fingerprint, so a cache computed with an older model is not reused.
 */
export const LAYOUT_MODEL_VERSION = 4;

/** What the worker computes for the three 3D views. */
export type Layout3dData = {
  /** Cube view: UMAP 3D positions. */
  coords: Map<string, Point3>;
  /** UMAP units per box unit, for the next run to start from this one. */
  unitsPerBox: number | null;
  /** The two most similar terms of every term (brain synapses). */
  neighbours: Map<string, string[]>;
  /** Space view: planet, moon or rock. */
  roles: Map<string, Role>;
  /** Brain view: neuron slots and which term lights which slot. */
  brain: BrainLayout;
};

type Stored = {
  v: 2;
  fingerprint: string;
  unitsPerBox: number | null;
  coords: Record<string, Point3>;
  neighbours: Record<string, string[]>;
  roles: Record<string, Role>;
  brain: { slots: number[]; region: number[]; fields: string[]; owner: number[]; termSlot: Record<string, number> };
};

/**
 * Changes whenever the set of terms, any term's embedding, or any term's
 * domain changes (galaxies and lobes depend on fields and branches). Editing
 * a term's text clears its 2D position and the Edge Function places it
 * again, so the 2D coordinates double as an "embedding version".
 */
export function fingerprint(
  points: readonly Pick<MapPoint, "id" | "has_embedding" | "map_x" | "map_y" | "domain_id">[],
  fieldIdOf: (domainId: string | null) => string | null = () => null,
): string {
  const parts = points
    .map(
      (p) =>
        `${p.id}:${p.has_embedding ? 1 : 0}:${p.map_x?.toFixed(4) ?? "-"}:${p.map_y?.toFixed(4) ?? "-"}:${p.domain_id ?? "-"}>${fieldIdOf(p.domain_id) ?? "-"}`,
    )
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
  return `m${LAYOUT_MODEL_VERSION}.${parts.length}-${(a >>> 0).toString(16)}${(b >>> 0).toString(16)}`;
}

const isPoint3 = (value: unknown): value is Point3 =>
  Array.isArray(value) && value.length === 3 && value.every((x) => typeof x === "number" && Number.isFinite(x));

const isRole = (value: unknown): value is Role => {
  const r = value as Role;
  return Boolean(r) && (r.kind === "planet" || r.kind === "rock" || (r.kind === "moon" && typeof r.parent === "string"));
};

function parse(storage: Pick<Storage, "getItem"> | null | undefined): Omit<Partial<Stored>, "v"> & { v?: number } {
  try {
    const raw = storage?.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Omit<Partial<Stored>, "v"> & { v?: number }) : {};
  } catch {
    return {};
  }
}

const pointsOf = (value: unknown): Record<string, Point3> => {
  const coords: Record<string, Point3> = {};
  if (value && typeof value === "object") for (const [id, p] of Object.entries(value)) if (isPoint3(p)) coords[id] = p;
  return coords;
};

/** The full cached layout (format 2); anything missing, older, unreadable or malformed counts as no cache. */
export function readCache(storage: Pick<Storage, "getItem"> | null | undefined): { fingerprint: string; data: Layout3dData } | null {
  try {
    const value = parse(storage);
    const brain = value.brain;
    if (value.v !== 2 || typeof value.fingerprint !== "string" || !brain || !Array.isArray(brain.slots)) return null;
    const count = brain.slots.length / 3;
    if (!Number.isInteger(count) || brain.region?.length !== count || brain.owner?.length !== count || !Array.isArray(brain.fields)) return null;

    const roles = new Map<string, Role>();
    for (const [id, role] of Object.entries(value.roles ?? {})) if (isRole(role)) roles.set(id, role);
    const neighbours = new Map<string, string[]>();
    for (const [id, list] of Object.entries(value.neighbours ?? {})) if (Array.isArray(list)) neighbours.set(id, list.filter((x) => typeof x === "string"));
    const termSlot = new Map<string, number>();
    for (const [id, slot] of Object.entries(brain.termSlot ?? {})) if (Number.isInteger(slot) && slot >= 0 && slot < count) termSlot.set(id, slot);

    return {
      fingerprint: value.fingerprint,
      data: {
        coords: new Map(Object.entries(pointsOf(value.coords))),
        unitsPerBox: typeof value.unitsPerBox === "number" && value.unitsPerBox > 0 ? value.unitsPerBox : null,
        neighbours,
        roles,
        brain: {
          slots: Array.from({ length: count }, (_, i) => [brain.slots[3 * i], brain.slots[3 * i + 1], brain.slots[3 * i + 2]] as Point3),
          slotRegion: brain.region,
          slotField: brain.owner.map((k) => (k >= 0 ? (brain.fields[k] ?? null) : null)),
          termSlot,
        },
      },
    };
  } catch {
    return null;
  }
}

/** Only the cube positions of the last layout (format 1 or 2), for the next run to start from. */
export function readPrevious(storage: Pick<Storage, "getItem"> | null | undefined): { coords: Record<string, Point3>; unitsPerBox: number | null } | null {
  const value = parse(storage);
  if ((value.v !== 1 && value.v !== 2) || !value.coords) return null;
  const unitsPerBox = typeof value.unitsPerBox === "number" && value.unitsPerBox > 0 ? value.unitsPerBox : null;
  return { coords: pointsOf(value.coords), unitsPerBox };
}

/** Saves the layout; a full or blocked storage is not an error (it is simply computed again next time). */
export function writeCache(storage: Pick<Storage, "setItem"> | null | undefined, key: string, data: Layout3dData): boolean {
  try {
    const round = (x: number) => Number(x.toFixed(4));
    const fields = [...new Set(data.brain.slotField.filter((f): f is string => f !== null))];
    const stored: Stored = {
      v: 2,
      fingerprint: key,
      unitsPerBox: data.unitsPerBox,
      coords: Object.fromEntries([...data.coords].map(([id, p]) => [id, p.map(round) as Point3])),
      neighbours: Object.fromEntries(data.neighbours),
      roles: Object.fromEntries(data.roles),
      brain: {
        slots: data.brain.slots.flatMap((p) => p.map((x) => Number(x.toFixed(3)))),
        region: data.brain.slotRegion,
        fields,
        owner: data.brain.slotField.map((f) => (f === null ? -1 : fields.indexOf(f))),
        termSlot: Object.fromEntries(data.brain.termSlot),
      },
    };
    storage?.setItem(CACHE_KEY, JSON.stringify(stored));
    return Boolean(storage);
  } catch {
    return false;
  }
}

/**
 * Field and branch of a term, as the space and brain views group them: the
 * branch key is the branch id, or `<fieldId>:umum` for a term filed directly
 * under a field. Both null without a (known) domain.
 */
export function termGroups(domainId: string | null, domains: ReadonlyMap<string, VocabDomain>): { fieldId: string | null; branchKey: string | null } {
  const domain = domainId ? domains.get(domainId) : undefined;
  if (!domain) return { fieldId: null, branchKey: null };
  const field = fieldOf(domain.id, domains) ?? domain;
  return { fieldId: field.id, branchKey: domain.parent_id ? domain.id : `${domain.id}:umum` };
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
