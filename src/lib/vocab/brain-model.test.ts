import { describe, expect, it } from "vitest";
import type { Point3 } from "./layout/run-layout-3d";
import { brainPoints } from "./brain-points";
import { allocateLobes, borderSlots, brainLayout, BRAIN_REGIONS, neuronCapacity, placeOnSlots, regionOf, scaffoldOpacity, scaffoldSlots } from "./brain-model";

describe("borderSlots (one term, many domains)", () => {
  // A toy brain: field A's lobe on the left, field B's on the right, a gap of free slots in between.
  const slots: Point3[] = [-3, -2, -1, 1, 2, 3].map((x) => [x, 0, 0]);
  const slotField = ["A", "A", "A", "B", "B", "B"];
  const termSlot = new Map([
    ["a1", 0],
    ["b1", 5],
    ["both", 1],
  ]);

  it("moves a term of two fields to the free slot nearest their border", () => {
    const moved = borderSlots({ slots, slotField, termSlot }, [{ id: "both", fieldIds: ["A", "B"] }]);
    expect([...moved]).toEqual([["both", 2]]);
  });

  it("leaves terms of one field (or of siblings in one field) where they are", () => {
    expect(borderSlots({ slots, slotField, termSlot }, [{ id: "a1", fieldIds: ["A", "A"] }]).size).toBe(0);
  });

  it("never gives two terms the same slot", () => {
    const moved = borderSlots({ slots, slotField, termSlot }, [
      { id: "both", fieldIds: ["A", "B"] },
      { id: "a1", fieldIds: ["A", "B"] },
    ]);
    expect(new Set(moved.values()).size).toBe(moved.size);
    expect([...moved.values()].every((s) => s === 1 || s === 2 || s === 3)).toBe(true);
  });
});

const dist = (a: Point3, b: Point3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe("baked brain points", () => {
  const points = brainPoints();

  it("are the model's outer surface on the app's axes: 2 units long, front to the right", () => {
    expect(points).toHaveLength(5000);
    const extent = (a: number) => [Math.min(...points.map((p) => p[a])), Math.max(...points.map((p) => p[a]))];
    const [x0, x1] = extent(0);
    expect(x1 - x0).toBeGreaterThan(1.9);
    expect(x1 - x0).toBeLessThan(2.05);
    // The brainstem hangs below the back half; the frontal pole does not reach that low.
    const lowest = points.reduce((a, b) => (b[1] < a[1] ? b : a));
    expect(lowest[0]).toBeLessThan(0);
    expect(Math.min(...points.filter((p) => p[0] > 0.8).map((p) => p[1]))).toBeGreaterThan(-0.3);
  });

  it("are in farthest-point order: every prefix keeps its points apart", () => {
    const spacing = (n: number) => {
      const prefix = points.slice(0, n);
      return Math.min(...prefix.map((p, i) => Math.min(...prefix.map((q, j) => (i === j ? Infinity : dist(p, q))))));
    };
    // 2,000 sleeping neurons stay about 0.074 apart (6.7 mm in the model); the first 350 even more.
    expect(spacing(2000)).toBeGreaterThan(0.07);
    expect(spacing(350)).toBeGreaterThan(0.15);
  });
});

describe("lobes", () => {
  it("names lobes by position on the model", () => {
    expect(BRAIN_REGIONS[regionOf([0.7, 0.2, -0.3])]).toBe("Frontal kiri");
    expect(BRAIN_REGIONS[regionOf([0.7, 0.2, 0.3])]).toBe("Frontal kanan");
    expect(BRAIN_REGIONS[regionOf([-0.7, -0.35, 0.2])]).toBe("Otak kecil");
    expect(BRAIN_REGIONS[regionOf([-0.2, -0.65, 0])]).toBe("Otak kecil"); // brainstem
    expect(BRAIN_REGIONS[regionOf([0.1, -0.3, 0.6])]).toBe("Temporal kanan");
    expect(BRAIN_REGIONS[regionOf([-0.8, 0.1, -0.3])]).toBe("Oksipital kiri");
    expect(BRAIN_REGIONS[regionOf([-0.2, 0.6, 0.2])]).toBe("Parietal kanan");
  });

  it("each get a fair share of the neurons", () => {
    const counts = new Map<number, number>();
    for (const s of scaffoldSlots(2000)) counts.set(s.region, (counts.get(s.region) ?? 0) + 1);
    expect(counts.size).toBe(BRAIN_REGIONS.length);
    for (const n of counts.values()) expect(n).toBeGreaterThan(80);
  });
});

describe("scaffoldSlots", () => {
  it("takes a prefix of the baked points", () => {
    const slots = scaffoldSlots(400);
    expect(slots).toHaveLength(400);
    expect(slots.map((s) => s.at)).toEqual(brainPoints().slice(0, 400));
    expect(scaffoldSlots(0)).toEqual([]);
  });
});

describe("neuronCapacity", () => {
  it("starts at 1,500 and adds 500 each time the terms pass it", () => {
    expect(neuronCapacity(0)).toBe(1500);
    expect(neuronCapacity(1500)).toBe(1500);
    expect(neuronCapacity(1501)).toBe(2000);
    expect(neuronCapacity(2000)).toBe(2000);
    expect(neuronCapacity(2001)).toBe(2500);
    expect(neuronCapacity(7342)).toBe(7500);
  });
});

describe("neurons beyond the baked points", () => {
  const baked = brainPoints();
  const slots = scaffoldSlots(6500).map((s) => s.at);
  const extra = slots.slice(baked.length);

  it("keeps the baked points and adds new ones, deterministically", () => {
    expect(slots).toHaveLength(6500);
    expect(slots.slice(0, baked.length)).toEqual(baked);
    expect(scaffoldSlots(6500).map((s) => s.at)).toEqual(slots);
  });

  it("puts new neurons on the surface, in the gaps, never on top of each other", () => {
    const nearestBaked = (p: Point3) => Math.min(...baked.map((q) => dist(p, q)));
    // Within the spacing of the baked points: on the surface between them, not floating off it.
    for (const p of extra.filter((_, i) => i % 25 === 0)) expect(nearestBaked(p)).toBeLessThan(0.06);
    const sample = slots.filter((_, i) => i % 13 === 0);
    const nearest = sample.map((p) => Math.min(...slots.map((q) => (q === p ? Infinity : dist(p, q))))).sort((a, b) => a - b);
    expect(nearest[0]).toBeGreaterThan(0.35 * nearest[Math.floor(nearest.length / 2)]);
  });
});

describe("allocateLobes", () => {
  it("gives each field at least one lobe, more to bigger fields, all lobes used", () => {
    const { units, parts } = allocateLobes([
      { fieldId: "a", count: 30 },
      { fieldId: "b", count: 5 },
      { fieldId: "c", count: 5 },
    ]);
    expect(parts).toBe(1);
    const sizes = ["a", "b", "c"].map((f) => units.get(f)?.length ?? 0);
    expect(sizes.reduce((s, n) => s + n, 0)).toBe(9);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(1);
    expect(sizes[0]).toBeGreaterThan(sizes[1]);
    // Adjacent lobes for one field.
    const a = units.get("a") as number[];
    expect(a).toEqual(Array.from({ length: a.length }, (_, i) => a[0] + i));
  });

  it("splits lobes when there are more fields than lobes", () => {
    const fields = Array.from({ length: 12 }, (_, i) => ({ fieldId: `f${i}`, count: 1 }));
    const { units, parts } = allocateLobes(fields);
    expect(parts).toBe(2);
    for (const f of fields) expect(units.get(f.fieldId)?.length).toBeGreaterThanOrEqual(1);
  });
});

describe("placeOnSlots / brainLayout", () => {
  it("gives every term its own slot and keeps similar terms close", () => {
    const slots = scaffoldSlots(300).map((s, index) => ({ index, at: s.at }));
    const terms = [
      ...Array.from({ length: 5 }, (_, i) => ({ id: `a${i}`, at: [-0.8 + i * 0.01, 0, 0] as Point3 })),
      ...Array.from({ length: 5 }, (_, i) => ({ id: `b${i}`, at: [0.8 + i * 0.01, 0, 0] as Point3 })),
    ];
    const placed = placeOnSlots(terms, slots);
    expect(new Set(placed.values()).size).toBe(10);
    const at = (id: string) => slots.find((s) => s.index === placed.get(id))?.at as Point3;
    const within = dist(at("a0"), at("a4")) + dist(at("b0"), at("b4"));
    const across = dist(at("a0"), at("b0")) + dist(at("a4"), at("b4"));
    expect(within).toBeLessThan(across);
  });

  it("finds a neuron for every term even when a field outgrows its lobes", () => {
    const terms = [
      ...Array.from({ length: 1400 }, (_, i) => ({ id: `a${i}`, fieldId: "a", at: [Math.sin(i), Math.cos(i * 1.3), Math.sin(i * 0.7)] as Point3 })),
      ...Array.from({ length: 100 }, (_, i) => ({ id: `b${i}`, fieldId: "b", at: [Math.cos(i), Math.sin(i * 1.1), 0.5] as Point3 })),
    ];
    const layout = brainLayout(terms);
    expect(layout.slots).toHaveLength(1500);
    expect(layout.termSlot.size).toBe(1500);
    expect(new Set(layout.termSlot.values()).size).toBe(1500);
  });

  it("lights each term in its own field's lobes, and fades the scaffold as terms grow", () => {
    const terms = [
      ...Array.from({ length: 6 }, (_, i) => ({ id: `ml${i}`, fieldId: "ml", at: [0.5, 0, i * 0.05] as Point3 })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: `bio${i}`, fieldId: "bio", at: [-0.5, 0, i * 0.05] as Point3 })),
      { id: "loose", fieldId: null, at: [0, 0.5, 0] as Point3 },
    ];
    const layout = brainLayout(terms);
    expect(layout.termSlot.size).toBe(terms.length);
    expect(new Set(layout.termSlot.values()).size).toBe(terms.length);
    for (const t of terms.filter((x) => x.fieldId)) expect(layout.slotField[layout.termSlot.get(t.id) as number]).toBe(t.fieldId);
    expect(layout.slots.length).toBe(1500);

    expect(scaffoldOpacity(5)).toBeGreaterThan(scaffoldOpacity(200));
    expect(scaffoldOpacity(350)).toBe(scaffoldOpacity(1000));
  });
});
