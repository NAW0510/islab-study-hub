import { describe, expect, it } from "vitest";
import { paddedHull, regionFor, withoutOutliers } from "./hull";
import { placeLabels, type LabelBox } from "./labels";
import type { Point } from "./layout/normalize";

const cluster: Point[] = [
  [0, 0],
  [0.1, 0],
  [0, 0.1],
  [0.1, 0.1],
  [0.05, 0.05],
  [0.02, 0.08],
];

describe("withoutOutliers", () => {
  it("drops a point far from the group and keeps the rest", () => {
    const kept = withoutOutliers([...cluster, [0.9, 0.9]]);
    expect(kept).toHaveLength(cluster.length);
    expect(kept).not.toContainEqual([0.9, 0.9]);
  });

  it("keeps everything when the group is tight or tiny", () => {
    expect(withoutOutliers(cluster)).toHaveLength(cluster.length);
    const tiny: Point[] = [
      [0, 0],
      [1, 1],
      [0, 1],
    ];
    expect(withoutOutliers(tiny)).toEqual(tiny);
  });
});

describe("paddedHull", () => {
  it("turns a single point into a circle of the pad radius", () => {
    const hull = paddedHull([[0.2, -0.3]], 0.1, 12)!;
    expect(hull).toHaveLength(12);
    for (const [x, y] of hull) expect(Math.hypot(x - 0.2, y + 0.3)).toBeCloseTo(0.1, 10);
  });

  it("wraps two points in a capsule", () => {
    const hull = paddedHull(
      [
        [0, 0],
        [1, 0],
      ],
      0.1,
      12,
    )!;
    const xs = hull.map((p) => p[0]);
    const ys = hull.map((p) => p[1]);
    expect(Math.min(...xs)).toBeCloseTo(-0.1, 10);
    expect(Math.max(...xs)).toBeCloseTo(1.1, 10);
    expect(Math.max(...ys)).toBeCloseTo(0.1, 10);
  });

  it("contains every original point with room to spare", () => {
    const hull = paddedHull(cluster, 0.08)!;
    const xs = hull.map((p) => p[0]);
    const ys = hull.map((p) => p[1]);
    for (const [x, y] of cluster) {
      expect(x).toBeGreaterThan(Math.min(...xs));
      expect(x).toBeLessThan(Math.max(...xs));
      expect(y).toBeGreaterThan(Math.min(...ys));
      expect(y).toBeLessThan(Math.max(...ys));
    }
  });

  it("returns null for no points", () => {
    expect(paddedHull([])).toBeNull();
  });
});

describe("regionFor", () => {
  it("returns a closed path, a centre inside the group and the full count", () => {
    const region = regionFor([...cluster, [0.9, 0.9]])!;
    expect(region.path.startsWith("M")).toBe(true);
    expect(region.path.endsWith("Z")).toBe(true);
    expect(region.count).toBe(cluster.length + 1);
    // The outlier is not part of the outline, so the centre stays with the cluster.
    expect(region.center[0]).toBeLessThan(0.3);
    expect(region.center[1]).toBeLessThan(0.3);
  });

  it("applies the projection to path and centre", () => {
    const region = regionFor([[0, 0]], ([x, y]) => [x * 100 + 500, -y * 100 + 300])!;
    expect(region.center[0]).toBeCloseTo(500, 6);
    expect(region.center[1]).toBeCloseTo(300, 6);
  });

  it("returns null without points", () => {
    expect(regionFor([])).toBeNull();
  });
});

describe("placeLabels", () => {
  const box = (id: string, x: number, y: number, priority: number): LabelBox => ({ id, x, y, width: 80, height: 16, priority });

  it("shows labels in priority order and hides the ones that would overlap", () => {
    const shown = placeLabels([box("rendah", 10, 10, 1), box("tinggi", 20, 14, 5), box("jauh", 300, 200, 2)]);
    expect(shown).toEqual(["tinggi", "jauh"]);
  });

  it("keeps labels that only touch across grid cells but do not overlap", () => {
    const shown = placeLabels([box("a", 0, 0, 3), box("b", 81, 0, 2), box("c", 0, 17, 1)]);
    expect(shown).toEqual(["a", "b", "c"]);
  });

  it("honours the maximum", () => {
    const labels = Array.from({ length: 10 }, (_, i) => box(`l${i}`, i * 200, 0, 10 - i));
    expect(placeLabels(labels, 3)).toEqual(["l0", "l1", "l2"]);
  });
});
