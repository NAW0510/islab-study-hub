import { describe, expect, it } from "vitest";
import { placeByNeighbors } from "./knn-place.ts";

const NO_JITTER = { KNN_PLACEMENT_K: 5, KNN_JITTER_RADIUS: 0 };

describe("placeByNeighbors", () => {
  it("returns null when no neighbour has a position yet", () => {
    expect(placeByNeighbors("a", [])).toBeNull();
  });

  it("is the weighted average with weight = similarity squared", () => {
    // weights 0.81 and 0.09 → x = (0.81·1 + 0.09·(−1)) / 0.9 = 0.8
    const position = placeByNeighbors(
      "a",
      [
        { similarity: 0.9, x: 1, y: 0 },
        { similarity: 0.3, x: -1, y: 0 },
      ],
      NO_JITTER,
    );
    expect(position?.x).toBeCloseTo(0.8, 10);
    expect(position?.y).toBeCloseTo(0, 10);
  });

  it("ignores dissimilar (negative) neighbours", () => {
    const position = placeByNeighbors(
      "a",
      [
        { similarity: 0.8, x: 0.5, y: 0.5 },
        { similarity: -0.4, x: -1, y: -1 },
      ],
      NO_JITTER,
    );
    expect(position).toEqual({ x: 0.5, y: 0.5 });
  });

  it("falls back to the plain centre when nothing is similar", () => {
    const position = placeByNeighbors(
      "a",
      [
        { similarity: 0, x: 0.2, y: 0 },
        { similarity: -0.1, x: 0.4, y: 0.2 },
      ],
      NO_JITTER,
    );
    expect(position?.x).toBeCloseTo(0.3, 10);
    expect(position?.y).toBeCloseTo(0.1, 10);
  });

  it("uses only the K nearest neighbours", () => {
    const far = { similarity: 0.1, x: -1, y: -1 };
    const near = Array.from({ length: 2 }, () => ({ similarity: 0.9, x: 0.6, y: 0.6 }));
    const position = placeByNeighbors("a", [far, ...near], { KNN_PLACEMENT_K: 2, KNN_JITTER_RADIUS: 0 });
    expect(position).toEqual({ x: 0.6, y: 0.6 });
  });

  it("adds a small jitter that is stable per id and differs between ids", () => {
    const neighbours = [{ similarity: 0.9, x: 0.1, y: 0.1 }];
    const a1 = placeByNeighbors("term-a", neighbours)!;
    const a2 = placeByNeighbors("term-a", neighbours)!;
    const b = placeByNeighbors("term-b", neighbours)!;
    expect(a1).toEqual(a2);
    expect(a1).not.toEqual(b);
    expect(Math.hypot(a1.x - 0.1, a1.y - 0.1)).toBeLessThanOrEqual(0.02 + 1e-12);
    expect(Math.hypot(b.x - 0.1, b.y - 0.1)).toBeLessThanOrEqual(0.02 + 1e-12);
  });

  it("stays inside the map", () => {
    const position = placeByNeighbors("edge", [{ similarity: 1, x: 1, y: -1 }])!;
    expect(Math.abs(position.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(position.y)).toBeLessThanOrEqual(1);
  });
});
