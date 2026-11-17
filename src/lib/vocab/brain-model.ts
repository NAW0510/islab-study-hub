import { LAYOUT_3D_CONFIG } from "./layout/config";
import type { Point3 } from "./layout/run-layout-3d";
import { brainPoints } from "./brain-points";

/**
 * The "Otak" view of the 3D brain map, as pure functions. The brain's shape
 * comes from a real 3D model ("Brain" by dgallichan, CC BY 4.0): points on
 * its outer surface, spread evenly and baked into brain-points.ts. Each field
 * gets one or more lobes; each term lights up one point (a neuron) in its
 * field's lobes, near the terms most like it.
 *
 * Axes: x = front (+) / back (−), y = up, z = left (−) / right (+). The brain
 * is 2 units long (1 unit ≈ 91 mm).
 */

type V3 = Point3;
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

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

/**
 * Index in BRAIN_REGIONS of the lobe a surface point belongs to, with
 * boundaries read off the model (the brainstem counts with the cerebellum).
 */
export function regionOf(p: V3): number {
  const [x, y, z] = p;
  if ((x < -0.4 && y < -0.18) || y < -0.5) return 4; // cerebellum (back, below the occipital lobe) and brainstem
  const left = z < 0;
  if (y < -0.12 && x > -0.4 && Math.abs(z) > 0.3) return left ? 3 : 5; // temporal: low on the side, under the Sylvian fissure
  if (x > 0.15) return left ? 0 : 8; // frontal
  if (x < -0.55) return left ? 2 : 6; // occipital
  return left ? 1 : 7; // parietal
}

/**
 * The first `n` neuron slots. The baked points are in farthest-point order,
 * so any prefix is spread evenly over the brain's outer surface.
 */
export function scaffoldSlots(n: number): { at: V3; region: number }[] {
  return brainPoints()
    .slice(0, Math.max(0, n))
    .map((at) => ({ at, region: regionOf(at) }));
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
export function brainLayout(terms: readonly { id: string; fieldId: string | null; at: V3 }[]): BrainLayout {
  const C = LAYOUT_3D_CONFIG;
  const slots = scaffoldSlots(Math.max(C.BRAIN_MIN_SLOTS, C.BRAIN_SLOTS_PER_TERM * terms.length));
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
