import { describe, expect, it } from "vitest";
import type { Point3 } from "./layout/run-layout-3d";
import { brainPoints } from "./brain-points";
import { allocateLobes, brainLayout, BRAIN_REGIONS, placeOnSlots, regionOf, scaffoldOpacity, scaffoldSlots } from "./brain-model";

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
    expect(layout.slots.length).toBeGreaterThanOrEqual(2000);

    expect(scaffoldOpacity(5)).toBeGreaterThan(scaffoldOpacity(200));
    expect(scaffoldOpacity(350)).toBe(scaffoldOpacity(1000));
  });
});
