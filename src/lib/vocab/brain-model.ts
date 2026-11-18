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
 * How many neurons the brain has for `terms` terms: BRAIN_BASE_NEURONS to
 * begin with, then BRAIN_NEURON_STEP more each time the terms pass it.
 */
export function neuronCapacity(terms: number): number {
  const { BRAIN_BASE_NEURONS: base, BRAIN_NEURON_STEP: step } = LAYOUT_3D_CONFIG;
  return terms <= base ? base : base + step * Math.ceil((terms - base) / step);
}

/**
 * The first `n` neuron slots. The baked points are in farthest-point order,
 * so any prefix is spread evenly over the brain's outer surface; beyond them,
 * new points are made between neighbouring ones (see `densify`).
 */
export function scaffoldSlots(n: number): { at: V3; region: number }[] {
  const baked = brainPoints();
  const count = Math.max(0, n);
  const points = count <= baked.length ? baked.slice(0, count) : [...baked, ...densify(baked, count - baked.length)];
  return points.map((at) => ({ at, region: regionOf(at) }));
}

/** A uniform grid over points, for neighbour queries. */
class Grid {
  private readonly cells = new Map<string, number[]>();
  constructor(private readonly size: number) {}
  private key(p: V3, d: V3 = [0, 0, 0]) {
    return `${Math.floor(p[0] / this.size) + d[0]},${Math.floor(p[1] / this.size) + d[1]},${Math.floor(p[2] / this.size) + d[2]}`;
  }
  add(p: V3, index: number) {
    const key = this.key(p);
    const cell = this.cells.get(key);
    if (cell) cell.push(index);
    else this.cells.set(key, [index]);
  }
  /** Indices in the 27 cells around `p`. */
  near(p: V3): number[] {
    const out: number[] = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) out.push(...(this.cells.get(this.key(p, [dx, dy, dz])) ?? []));
    return out;
  }
}

/**
 * `extra` new points on the brain's surface, beyond the baked ones. Each
 * round takes the midpoints between every point and its three nearest
 * neighbours (on a surface sampled this densely a midpoint lies on it, a
 * fraction of a millimetre off), then adds them farthest-first, at most half
 * as many as there already are, so the new points fill the gaps evenly.
 * Deterministic.
 */
export function densify(base: readonly V3[], extra: number): V3[] {
  const points: V3[] = [...base];
  const added: V3[] = [];
  // Typical spacing of the base: median distance to the nearest neighbour, over an even sample.
  const sample = base.filter((_, i) => i % Math.max(1, Math.floor(base.length / 120)) === 0);
  const gaps = sample.map((p) => Math.min(...base.map((q) => (q === p ? Infinity : dist(p, q))))).sort((a, b) => a - b);
  const baseSpacing = gaps[Math.floor(gaps.length / 2)] ?? 0.05;
  while (added.length < extra) {
    // The surface area stays the same, so spacing² × N stays about constant.
    const spacing = baseSpacing * Math.sqrt(base.length / points.length);
    const size = spacing * 2.5;
    const grid = new Grid(size);
    points.forEach((p, i) => grid.add(p, i));

    const seen = new Set<string>();
    const candidates: V3[] = [];
    points.forEach((p, i) => {
      const nearest = grid
        .near(p)
        .filter((j) => j !== i)
        .map((j) => ({ j, d: dist(p, points[j]) }))
        .sort((a, b) => a.d - b.d || a.j - b.j)
        .slice(0, 3);
      for (const { j } of nearest) {
        const key = i < j ? `${i}|${j}` : `${j}|${i}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const q = points[j];
        candidates.push([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2]);
      }
    });

    // Farthest-first: repeatedly take the candidate farthest from every point so far.
    const nearestTo = candidates.map((c) => Math.min(size * 1.5, ...grid.near(c).map((j) => dist(c, points[j]))));
    const candidateGrid = new Grid(size);
    candidates.forEach((c, i) => candidateGrid.add(c, i));
    const want = Math.min(extra - added.length, Math.ceil(points.length / 2), candidates.length);
    for (let k = 0; k < want; k++) {
      let best = -1;
      for (let i = 0; i < candidates.length; i++) if (nearestTo[i] >= 0 && (best < 0 || nearestTo[i] > nearestTo[best])) best = i;
      if (best < 0) break;
      const p = candidates[best];
      points.push(p);
      added.push(p);
      nearestTo[best] = -1;
      for (const i of candidateGrid.near(p)) if (nearestTo[i] >= 0) nearestTo[i] = Math.min(nearestTo[i], dist(candidates[i], p));
    }
  }
  return added;
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
  const slots = scaffoldSlots(neuronCapacity(terms.length));
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
  for (const t of terms) {
    const list = groups.get(t.fieldId);
    if (list) list.push({ id: t.id, at: t.at });
    else groups.set(t.fieldId, [{ id: t.id, at: t.at }]);
  }
  const used = new Set<number>();
  const take = (members: readonly { id: string; at: V3 }[], allowed: (index: number) => boolean) => {
    const free = slots.map((s, index) => ({ index, at: s.at })).filter(({ index }) => allowed(index) && !used.has(index));
    for (const [id, slot] of placeOnSlots(members, free)) {
      termSlot.set(id, slot);
      used.add(slot);
    }
  };
  for (const [fieldId, members] of groups) {
    const owner = fieldId ?? (slotField.some((f) => f === null) ? null : largest);
    take(members, (index) => slotField[index] === owner);
  }
  // A field with more terms than its lobes hold spills over into the nearest free neurons elsewhere.
  const left = terms.filter((t) => !termSlot.has(t.id)).map((t) => ({ id: t.id, at: t.at }));
  if (left.length) take(left, () => true);
  return { slots: slots.map((s) => s.at), slotRegion: slots.map((s) => s.region), slotField, termSlot };
}

/**
 * Neurons on the border between lobes for the terms that belong to several
 * fields (one term, many domains): for each such term, the free slot of one
 * of its fields that is nearest the middle of those fields' lobes. Computed
 * from a finished layout, so a cached layout needs no recomputation. Terms
 * whose domains share one field keep their own slot (their lobe is shared
 * already). Returns only the terms that move.
 */
export function borderSlots(
  layout: Pick<BrainLayout, "slots" | "slotField" | "termSlot">,
  terms: readonly { id: string; fieldIds: readonly string[] }[],
): Map<string, number> {
  const centre = new Map<string, { at: V3; n: number }>();
  layout.slots.forEach((slot, i) => {
    const field = layout.slotField[i];
    if (!field) return;
    const entry = centre.get(field) ?? { at: [0, 0, 0] as V3, n: 0 };
    for (let a = 0; a < 3; a++) entry.at[a] += slot[a];
    entry.n++;
    centre.set(field, entry);
  });
  const used = new Set(layout.termSlot.values());
  const out = new Map<string, number>();
  for (const term of [...terms].sort((a, b) => a.id.localeCompare(b.id))) {
    const fields = [...new Set(term.fieldIds)].filter((f) => centre.has(f));
    if (fields.length < 2) continue;
    const middle: V3 = [0, 0, 0];
    for (const f of fields) {
      const { at, n } = centre.get(f) as { at: V3; n: number };
      for (let a = 0; a < 3; a++) middle[a] += at[a] / n / fields.length;
    }
    let best = -1;
    let bestD = Infinity;
    layout.slots.forEach((slot, i) => {
      const field = layout.slotField[i];
      if (!field || !fields.includes(field) || used.has(i)) return;
      const d = dist(slot, middle);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best < 0) continue;
    const own = layout.termSlot.get(term.id);
    if (own !== undefined) used.delete(own);
    used.add(best);
    out.set(term.id, best);
  }
  return out;
}

/** How visible the sleeping-neuron scaffold is: strong with few terms, faint once the terms alone draw the brain. */
export function scaffoldOpacity(terms: number): number {
  const C = LAYOUT_3D_CONFIG;
  const t = Math.min(1, terms / C.BRAIN_FULL_TERMS);
  return C.BRAIN_SCAFFOLD_MAX - (C.BRAIN_SCAFFOLD_MAX - C.BRAIN_SCAFFOLD_MIN) * t;
}
