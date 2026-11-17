import { LAYOUT_3D_CONFIG } from "./layout/config";
import { mulberry32 } from "./layout/prng";
import type { Point3 } from "./layout/run-layout-3d";

/**
 * The "Otak" view of the 3D brain map, as pure functions. A procedural brain
 * (two hemispheres with the longitudinal fissure, temporal lobes, cerebellum,
 * brainstem; folds as a pattern on the surface) is covered with evenly spread
 * neuron slots. Each field gets one or more lobes; each term lights up one
 * slot in its field's lobes, near the terms most like it.
 *
 * Axes: x = front (+) / back (−), y = up, z = left (−) / right (+).
 */

type V3 = Point3;
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const PARTS: { c: V3; r: V3 }[] = [
  ...[-1, 1].flatMap((s) => [
    { c: [0, 0.08, s * 0.4] as V3, r: [0.95, 0.6, 0.36] as V3 }, // cerebral hemisphere
    { c: [0.12, -0.28, s * 0.42] as V3, r: [0.48, 0.27, 0.3] as V3 }, // temporal lobe
  ]),
  { c: [-0.6, -0.45, 0], r: [0.33, 0.2, 0.58] }, // cerebellum
  { c: [-0.28, -0.7, 0], r: [0.13, 0.3, 0.13] }, // brainstem
];

/** Negative inside the brain, zero on its surface (in "ellipsoid radii", roughly distance). */
export function brainField(p: V3): number {
  let best = Infinity;
  for (const { c, r } of PARTS) {
    const v = Math.hypot((p[0] - c[0]) / r[0], (p[1] - c[1]) / r[1], (p[2] - c[2]) / r[2]) - 1;
    if (v < best) best = v;
  }
  return best;
}

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

/** Index in BRAIN_REGIONS of the lobe a surface point belongs to. */
export function regionOf(p: V3): number {
  const [x, y, z] = p;
  if (y < -0.25 && x < -0.25) return 4; // cerebellum (and brainstem)
  const left = z < 0;
  if (y < -0.12 && x > -0.45) return left ? 3 : 5;
  if (x > 0.25) return left ? 0 : 8;
  if (x < -0.45) return left ? 2 : 6;
  return left ? 1 : 7;
}

/**
 * Fold pattern on the surface, 0…1: meandering ridges (gyri) on the cerebrum,
 * fine parallel folds on the cerebellum. Slots are only placed where it is
 * above a threshold, so the grooves (sulci) between ridges stay empty.
 */
export function foldPattern(p: V3): number {
  const [x, y, z] = p;
  if (regionOf(p) === 4) return 0.5 + 0.5 * Math.sin(38 * y + 3 * Math.sin(5 * z));
  const meander = 13 * (0.8 * x + 0.35 * Math.sin(3.1 * y + 1.7 * z) + 0.45 * y * z) + 2.3 * Math.sin(2.2 * x - 1.3 * z) + 1.4 * Math.sin(4.1 * y);
  return 0.5 + 0.5 * Math.sin(meander);
}

/**
 * `n` neuron slots spread evenly over the folded surface (farthest point
 * sampling from many candidates near the surface). Deterministic for a seed.
 */
export function scaffoldSlots(n: number, seed = 11): { at: V3; region: number }[] {
  if (n <= 0) return [];
  const random = mulberry32(seed);
  const want = Math.max(4 * n, 6000);
  const candidates: V3[] = [];
  for (let tries = 0; candidates.length < want && tries < want * 400; tries++) {
    const p: V3 = [random() * 2.2 - 1.1, random() * 1.8 - 1.0, random() * 1.8 - 0.9];
    if (Math.abs(brainField(p)) < 0.025 && foldPattern(p) > 0.38) candidates.push(p);
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
  return chosen.map((at) => ({ at, region: regionOf(at) }));
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
