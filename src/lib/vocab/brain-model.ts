import { LAYOUT_3D_CONFIG } from "./layout/config";
import { mulberry32 } from "./layout/prng";
import type { Point3 } from "./layout/run-layout-3d";

/**
 * The "Otak" view of the 3D brain map, as pure functions. A procedural brain
 * with real proportions (length : width : height ≈ 1 : 0.84 : 0.56): two
 * hemispheres split by the longitudinal fissure, temporal lobes under the
 * Sylvian fissure, the cerebellum with its fine folds, the pons and the
 * brainstem, and a labyrinth of gyri and sulci on the cortex. Neuron slots
 * sit on the crests of the folds. Each field gets one or more lobes; each
 * term lights up one slot in its field's lobes, near the terms most like it.
 *
 * Distances are signed: negative inside the brain, zero on its surface.
 * Axes: x = front (+) / back (−), y = up, z = left (−) / right (+).
 */

type V3 = Point3;
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Approximate signed distance to an axis-aligned ellipsoid (exact enough near its surface). */
function ellipsoid(p: V3, c: V3, r: V3): number {
  const k = Math.hypot((p[0] - c[0]) / r[0], (p[1] - c[1]) / r[1], (p[2] - c[2]) / r[2]);
  return (k - 1) * Math.min(r[0], r[1], r[2]);
}
/** Smooth union and intersection (polynomial, blend width `k`). */
const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);
/** Cuts a groove: removes the part of the solid where `groove < 0`, down to `depth` below the surface. */
const carve = (solid: number, groove: number, depth: number) => Math.max(solid, Math.min(-groove, solid + depth));

function capsule(p: V3, a: V3, b: V3, r: number): number {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2)));
  return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t) - r;
}

/** One cerebral hemisphere (side −1 = left, +1 = right) with its temporal lobe, before folding. */
function hemisphere(p: V3, side: number): number {
  const [x, y, z] = p;
  const front = Math.max(0, x);
  const back = Math.max(0, -x - 0.3);
  // Lower and narrower towards the frontal pole, a little pointed at the occipital pole.
  const ry = 0.6 * (1 - 0.22 * front * front);
  const rz = 0.42 * (1 - 0.14 * front * front - 0.3 * back * back);
  const cy = 0.08 - 0.07 * front * front;
  let d = ellipsoid(p, [0, cy, side * 0.42], [1.0, ry, rz]);
  d = smax(d, -(y + 0.3), 0.08); // flat underside
  // Temporal lobe: under the side, its front end lower than its back.
  const temporal = ellipsoid([x, y + 0.12 * (x - 0.1), z], [0.1, -0.3, side * 0.52], [0.52, 0.22, 0.27]);
  d = smin(d, temporal, 0.07);
  // Sylvian fissure: the groove between the temporal lobe and the frontal/parietal lobes, on the outside.
  if (x > -0.28 && x < 0.5 && Math.abs(z) > 0.42) {
    const lineY = -0.15 + 0.17 * ((0.5 - x) / 0.78);
    d = carve(d, Math.abs(y - lineY) - 0.016, 0.09);
  }
  return d;
}

/** The two hemispheres with the longitudinal fissure between them, before folding. */
function cerebrum(p: V3): number {
  // A plain minimum keeps the deep crease where the hemispheres meet.
  let d = Math.min(hemisphere(p, -1), hemisphere(p, 1));
  // Longitudinal fissure: a gap between the hemispheres, down to the corpus callosum. Wide enough
  // (0.056) for the surface mesh (one grid cell ≈ 0.023) to show it.
  d = Math.max(d, -Math.max(Math.abs(p[2]) - 0.028, -0.08 - p[1]));
  return d;
}

function hindbrain(p: V3): { cerebellum: number; stem: number } {
  const [, y, z] = p;
  let cerebellum = ellipsoid(p, [-0.6, -0.44, 0], [0.37, 0.22, 0.6]);
  // Folia: fine, nearly horizontal folds.
  if (Math.abs(cerebellum) < 0.08) cerebellum -= 0.011 * Math.sin((2 * Math.PI * (y + 0.12 * z * z)) / 0.075);
  const pons = ellipsoid(p, [-0.18, -0.56, 0], [0.17, 0.15, 0.17]);
  const medulla = capsule(p, [-0.2, -0.62, 0], [-0.27, -1.02, 0], 0.095);
  return { cerebellum, stem: smin(pons, medulla, 0.06) };
}

// Gyri: a random wave field with one wavelength. Its zero crossings meander like a maze, which is
// what the sulci on a cortex look like. 24 fixed directions and phases keep it deterministic.
const GYRUS_WAVELENGTH = 0.24;
const WAVES = (() => {
  const random = mulberry32(9);
  const n = 24;
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: n }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    return { d: [Math.cos(golden * i) * r, y, Math.sin(golden * i) * r] as V3, phase: random() * Math.PI * 2 };
  });
})();
const WAVE_K = (2 * Math.PI) / GYRUS_WAVELENGTH;
const WAVE_NORM = Math.sqrt(WAVES.length / 2);

/** The fold field, roughly −2…2: positive on gyri (ridges), negative in sulci (grooves). */
export function gyri(p: V3): number {
  // A gentle warp makes the maze less regular.
  const q: V3 = [p[0] + 0.04 * Math.sin(3.1 * p[1] + 1.3 * p[2]), p[1] + 0.04 * Math.sin(2.7 * p[2] + 1.9 * p[0]), p[2] + 0.03 * Math.sin(2.3 * p[0] + 1.1 * p[1])];
  let sum = 0;
  for (const { d, phase } of WAVES) sum += Math.cos(WAVE_K * (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) + phase);
  return sum / WAVE_NORM;
}

/** Depth of the folds on the cortex. */
const FOLD_DEPTH = 0.032;

/**
 * Signed distance to the brain surface, folds included. The folds are only
 * evaluated near the surface (they do not matter far from it), which keeps
 * this cheap enough to sample a million times for the surface mesh.
 */
export function brainField(p: V3): number {
  // Far outside an ellipsoid that holds the whole brain (checked in the tests) the exact value does not matter.
  const outer = ellipsoid(p, [0, -0.15, 0], [1.25, 1.1, 1.05]);
  if (outer > 0.12) return outer;
  let cortex = cerebrum(p);
  if (Math.abs(cortex) < 0.1) cortex -= FOLD_DEPTH * Math.tanh(1.6 * (gyri(p) + 0.3));
  const { cerebellum, stem } = hindbrain(p);
  return Math.min(cortex, cerebellum, stem);
}

/** Outward surface normal at `p` (gradient of the distance, by central differences). */
export function brainNormal(p: V3, h = 0.004): V3 {
  const g: V3 = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    const plus = [...p] as V3;
    const minus = [...p] as V3;
    plus[a] += h;
    minus[a] -= h;
    g[a] = brainField(plus) - brainField(minus);
  }
  const l = Math.hypot(g[0], g[1], g[2]) || 1;
  return [g[0] / l, g[1] / l, g[2] / l];
}

/** The box the brain fits in: centre and half the longest side. */
export const BRAIN_BOUNDS = { centre: [0, -0.15, 0] as V3, half: 1.1 };

/**
 * Lobes, in an order where neighbours in the list are neighbours on the brain
 * (a walk around it), so a field that gets several lobes gets adjacent ones.
 */
export const BRAIN_REGIONS = [
  "Frontal kiri",
  "Parietal kiri",
  "Oksipital kiri",
  "Temporal kiri",
  "Otak kecil",
  "Temporal kanan",
  "Oksipital kanan",
  "Parietal kanan",
  "Frontal kanan",
] as const;

/** Index in BRAIN_REGIONS of the lobe a surface point belongs to (the brainstem counts with the cerebellum). */
export function regionOf(p: V3): number {
  const [x, y, z] = p;
  if (y < -0.3 && x < -0.12) return 4; // cerebellum, pons, brainstem
  const left = z < 0;
  if (y < -0.1 && x > -0.4 && Math.abs(z) > 0.3) return left ? 3 : 5; // temporal
  if (x > 0.28) return left ? 0 : 8; // frontal
  if (x < -0.5) return left ? 2 : 6; // occipital
  return left ? 1 : 7; // parietal
}

/** Whether a surface point is on the crest of a fold (where neurons sit); the stem has no folds. */
function onCrest(p: V3): boolean {
  if (regionOf(p) === 4) {
    if (p[1] < -0.62 || (p[0] > -0.36 && p[1] < -0.4)) return true; // pons and medulla
    return Math.sin((2 * Math.PI * (p[1] + 0.12 * p[2] * p[2])) / 0.075) > 0.1;
  }
  return gyri(p) + 0.3 > 0.35;
}

/**
 * `n` neuron slots spread evenly over the crests of the folds (farthest
 * point sampling from many candidates on the surface), lifted a hair above
 * the surface so they sit on it. Deterministic for a seed.
 */
export function scaffoldSlots(n: number, seed = 11): { at: V3; region: number }[] {
  if (n <= 0) return [];
  const random = mulberry32(seed);
  const want = Math.max(4 * n, 6000);
  const { centre, half } = BRAIN_BOUNDS;
  const candidates: V3[] = [];
  for (let tries = 0; candidates.length < want && tries < want * 600; tries++) {
    const p: V3 = [centre[0] + (random() * 2 - 1) * half, centre[1] + (random() * 2 - 1) * half, centre[2] + (random() * 2 - 1) * 0.92];
    if (Math.abs(brainField(p)) < 0.016 && onCrest(p)) candidates.push(p);
  }

  // Farthest point sampling: each new slot is the candidate farthest from all slots so far.
  const chosen: V3[] = [candidates[0]];
  const nearest = candidates.map((c) => dist(c, candidates[0]));
  while (chosen.length < Math.min(n, candidates.length)) {
    let best = 0;
    for (let i = 1; i < candidates.length; i++) if (nearest[i] > nearest[best]) best = i;
    const q = candidates[best];
    chosen.push(q);
    for (let i = 0; i < candidates.length; i++) {
      const d = dist(candidates[i], q);
      if (d < nearest[i]) nearest[i] = d;
    }
  }
  return chosen.map((at) => {
    const normal = brainNormal(at);
    const lifted: V3 = [at[0] + normal[0] * 0.012, at[1] + normal[1] * 0.012, at[2] + normal[2] * 0.012];
    return { at: lifted, region: regionOf(at) };
  });
}

/**
 * Lobes per field: every field gets at least one, the rest go to the larger
 * fields (largest remainder), and a field's lobes are adjacent on the brain.
 * With more fields than lobes, every lobe is split into equal parts first.
 * Returns, per field, the list of "units" (lobe index × parts + part).
 */
export function allocateLobes(fields: readonly { fieldId: string; count: number }[], regions = BRAIN_REGIONS.length) {
  const ordered = [...fields].sort((a, b) => b.count - a.count || a.fieldId.localeCompare(b.fieldId));
  const parts = Math.max(1, Math.ceil(ordered.length / regions));
  const units = regions * parts;
  const total = ordered.reduce((s, f) => s + f.count, 0) || 1;

  const share = ordered.map((f) => 1 + ((units - ordered.length) * f.count) / total);
  const given = share.map((s) => Math.floor(s));
  let left = units - given.reduce((s, g) => s + g, 0);
  const byRemainder = share.map((s, i) => ({ i, r: s - Math.floor(s) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of byRemainder) {
    if (left <= 0) break;
    given[i]++;
    left--;
  }

  const out = new Map<string, number[]>();
  let next = 0;
  ordered.forEach((f, i) => {
    out.set(f.fieldId, Array.from({ length: given[i] }, (_, k) => next + k));
    next += given[i];
  });
  return { units: out, parts };
}

/**
 * Puts each term on a free slot near where it sits among its field's terms in
 * the 3D (cube) layout: that arrangement is centred and scaled onto the
 * field's slots, then every term (outermost first) takes the nearest free one.
 * Terms close in meaning end up close on the brain.
 */
export function placeOnSlots(terms: readonly { id: string; at: V3 }[], slots: readonly { index: number; at: V3 }[]): Map<string, number> {
  const out = new Map<string, number>();
  if (terms.length === 0 || slots.length === 0) return out;
  const mean = (points: readonly V3[]): V3 => {
    const m: V3 = [0, 0, 0];
    for (const p of points) for (let a = 0; a < 3; a++) m[a] += p[a] / points.length;
    return m;
  };
  const rms = (points: readonly V3[], c: V3) => Math.sqrt(points.reduce((s, p) => s + dist(p, c) ** 2, 0) / points.length) || 1;

  const termCentre = mean(terms.map((t) => t.at));
  const slotCentre = mean(slots.map((s) => s.at));
  const k = terms.length > 1 ? rms(slots.map((s) => s.at), slotCentre) / rms(terms.map((t) => t.at), termCentre) : 0;
  const target = (p: V3): V3 => [0, 1, 2].map((a) => slotCentre[a] + (p[a] - termCentre[a]) * k) as V3;

  const free = new Set(slots.map((_, i) => i));
  const order = [...terms].sort((a, b) => dist(b.at, termCentre) - dist(a.at, termCentre) || a.id.localeCompare(b.id));
  for (const term of order) {
    const goal = target(term.at);
    let best = -1;
    let bestD = Infinity;
    for (const i of free) {
      const d = dist(slots[i].at, goal);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) break;
    free.delete(best);
    out.set(term.id, slots[best].index);
  }
  return out;
}

export type BrainLayout = {
  slots: V3[];
  /** Lobe (index in BRAIN_REGIONS) of each slot. */
  slotRegion: number[];
  /** Field whose lobe each slot belongs to, or null for a lobe no field uses. */
  slotField: (string | null)[];
  /** Slot index of each term. */
  termSlot: Map<string, number>;
};

/**
 * The whole brain: slots, which field owns which lobe, and which slot each
 * term lights up. Terms without a domain share the lobes nobody else uses
 * (or, when every lobe is taken, the largest field's).
 */
export function brainLayout(terms: readonly { id: string; fieldId: string | null; at: V3 }[], seed = 11): BrainLayout {
  const C = LAYOUT_3D_CONFIG;
  const slots = scaffoldSlots(Math.max(C.BRAIN_MIN_SLOTS, C.BRAIN_SLOTS_PER_TERM * terms.length), seed);
  const counts = new Map<string, number>();
  for (const t of terms) if (t.fieldId) counts.set(t.fieldId, (counts.get(t.fieldId) ?? 0) + 1);
  const { units, parts } = allocateLobes([...counts].map(([fieldId, count]) => ({ fieldId, count })));

  // Split every lobe into `parts` along the front-back axis, so a shared lobe is shared in clean slices.
  const unitOf = new Array<number>(slots.length);
  for (let region = 0; region < BRAIN_REGIONS.length; region++) {
    const inRegion = slots.map((s, i) => ({ i, x: s.at[0] })).filter(({ i }) => slots[i].region === region).sort((a, b) => b.x - a.x || a.i - b.i);
    inRegion.forEach(({ i }, k) => (unitOf[i] = region * parts + Math.floor((k * parts) / Math.max(1, inRegion.length))));
  }
  const ownerOfUnit = new Map<number, string>();
  for (const [fieldId, list] of units) for (const u of list) ownerOfUnit.set(u, fieldId);
  const slotField = slots.map((_, i) => ownerOfUnit.get(unitOf[i]) ?? null);

  const termSlot = new Map<string, number>();
  const largest = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const groups = new Map<string | null, { id: string; at: V3 }[]>();
  for (const t of terms) groups.set(t.fieldId, [...(groups.get(t.fieldId) ?? []), { id: t.id, at: t.at }]);
  const used = new Set<number>();
  for (const [fieldId, members] of groups) {
    const owner = fieldId ?? (slotField.some((f) => f === null) ? null : largest);
    const mine = slots.map((s, index) => ({ index, at: s.at })).filter(({ index }) => slotField[index] === owner && !used.has(index));
    for (const [id, slot] of placeOnSlots(members, mine)) {
      termSlot.set(id, slot);
      used.add(slot);
    }
  }
  return { slots: slots.map((s) => s.at), slotRegion: slots.map((s) => s.region), slotField, termSlot };
}

/** How visible the sleeping-neuron scaffold is: strong with few terms, faint once the terms alone draw the brain. */
export function scaffoldOpacity(terms: number): number {
  const C = LAYOUT_3D_CONFIG;
  const t = Math.min(1, terms / C.BRAIN_FULL_TERMS);
  return C.BRAIN_SCAFFOLD_MAX - (C.BRAIN_SCAFFOLD_MAX - C.BRAIN_SCAFFOLD_MIN) * t;
}
