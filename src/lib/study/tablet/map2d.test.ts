import { describe, expect, it } from "vitest";
import { polygonContains } from "d3-polygon";
import { mapToPlane, nearestTerm, regionAt, smoothClosed } from "./map2d";

const pt = (id: string, x: number | null, y: number | null) => ({ id, term: id, map_x: x, map_y: y });

describe("smoothClosed", () => {
  it("passes through every corner and returns the asked number of samples", () => {
    const square: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    const ring = smoothClosed(square, 40);
    expect(ring).toHaveLength(40);
    expect(ring[0]).toEqual([0, 0]);
    expect(ring[10][0]).toBeCloseTo(1, 6);
    expect(ring[10][1]).toBeCloseTo(0, 6);
  });
});

describe("mapToPlane", () => {
  const points = [
    pt("a1", -0.6, 0.5),
    pt("a2", -0.5, 0.6),
    pt("a3", -0.55, 0.45),
    pt("b1", 0.6, -0.4),
    pt("b2", 0.5, -0.5),
    pt("nowhere", null, null),
  ];
  const fields: Record<string, string[]> = { a1: ["A"], a2: ["A"], a3: ["A", "B"], b1: ["B"], b2: ["B"], nowhere: ["A"] };
  const { terms, regions } = mapToPlane(points, (p) => fields[p.id], 4, 48);

  it("scales the [-1, 1] square onto the plane and drops terms without a place", () => {
    expect(terms.map((t) => t.id)).toEqual(["a1", "a2", "a3", "b1", "b2"]);
    expect(terms[0]).toMatchObject({ x: -1.2, y: 1, fieldId: "A" });
  });

  it("draws one region per field around its own terms; a far guest does not stretch it", () => {
    const a = regions.find((r) => r.fieldId === "A")!;
    const b = regions.find((r) => r.fieldId === "B")!;
    for (const t of terms.filter((t) => t.fieldId === "A")) expect(polygonContains(a.ring, [t.x, t.y])).toBe(true);
    const a3 = terms.find((t) => t.id === "a3")!;
    expect(polygonContains(b.ring, [a3.x, a3.y])).toBe(false);
    expect(b.count).toBe(2);
  });

  it("takes a close guest inside the region", () => {
    const close = [pt("b1", 0.6, -0.4), pt("b2", 0.5, -0.5), pt("g", 0.56, -0.44)];
    const own: Record<string, string[]> = { b1: ["B"], b2: ["B"], g: ["C", "B"] };
    const { terms: t2, regions: r2 } = mapToPlane(close, (p) => own[p.id], 4, 48);
    const g = t2.find((t) => t.id === "g")!;
    expect(polygonContains(r2.find((r) => r.fieldId === "B")!.ring, [g.x, g.y])).toBe(true);
  });

  it("finds the nearest term within reach, and the region under a point", () => {
    expect(nearestTerm(terms, -1.18, 1.02, 0.1)?.id).toBe("a1");
    expect(nearestTerm(terms, 0, 0, 0.1)).toBeNull();
    expect(regionAt(regions, -1.1, 1)?.fieldId).toBe("A");
    expect(regionAt(regions, 1.9, 1.9)).toBeNull();
  });
});
