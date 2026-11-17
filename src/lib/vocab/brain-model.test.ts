import { describe, expect, it } from "vitest";
import type { Point3 } from "./layout/run-layout-3d";
import { allocateLobes, brainField, brainLayout, BRAIN_REGIONS, placeOnSlots, regionOf, scaffoldOpacity, scaffoldSlots } from "./brain-model";

const dist = (a: Point3, b: Point3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe("brain shape", () => {
  it("is a closed shape with a fissure between the hemispheres", () => {
    expect(brainField([0, 0.1, 0.4])).toBeLessThan(0); // inside the left/right hemisphere
    expect(brainField([0, 0.1, -0.4])).toBeLessThan(0);
    expect(brainField([0, 2, 0])).toBeGreaterThan(0); // outside
    expect(brainField([0.3, 0.66, 0])).toBeGreaterThan(0); // the top of the fissure is a gap
  });

  it("names lobes by position", () => {
    expect(BRAIN_REGIONS[regionOf([0.7, 0.2, -0.3])]).toBe("Frontal kiri");
    expect(BRAIN_REGIONS[regionOf([0.7, 0.2, 0.3])]).toBe("Frontal kanan");
    expect(BRAIN_REGIONS[regionOf([-0.6, -0.45, 0.2])]).toBe("Otak kecil");
    expect(BRAIN_REGIONS[regionOf([0.1, -0.3, 0.6])]).toBe("Temporal kanan");
    expect(BRAIN_REGIONS[regionOf([-0.7, 0.1, -0.3])]).toBe("Oksipital kiri");
  });
});

describe("scaffoldSlots", () => {
  const slots = scaffoldSlots(400, 5);

  it("puts every slot on the surface, deterministically", () => {
    expect(slots).toHaveLength(400);
    for (const s of slots) expect(Math.abs(brainField(s.at))).toBeLessThan(0.03);
    expect(scaffoldSlots(400, 5)).toEqual(slots);
  });

  it("spreads slots evenly (no clumps): the closest pair is not much closer than the typical spacing", () => {
    const nearest = slots.map((s, i) => Math.min(...slots.map((o, j) => (i === j ? Infinity : dist(s.at, o.at))))).sort((a, b) => a - b);
    const median = nearest[Math.floor(nearest.length / 2)];
    expect(nearest[0]).toBeGreaterThan(0.4 * median);
  });

  it("covers every lobe", () => {
    expect(new Set(slots.map((s) => s.region)).size).toBe(BRAIN_REGIONS.length);
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
    const slots = scaffoldSlots(300, 2).map((s, index) => ({ index, at: s.at }));
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
    const layout = brainLayout(terms, 3);
    expect(layout.termSlot.size).toBe(terms.length);
    expect(new Set(layout.termSlot.values()).size).toBe(terms.length);
    for (const t of terms.filter((x) => x.fieldId)) expect(layout.slotField[layout.termSlot.get(t.id) as number]).toBe(t.fieldId);
    expect(layout.slots.length).toBeGreaterThanOrEqual(1500);

    expect(scaffoldOpacity(5)).toBeGreaterThan(scaffoldOpacity(200));
    expect(scaffoldOpacity(250)).toBe(scaffoldOpacity(1000));
  });
});
