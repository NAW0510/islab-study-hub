import { describe, expect, it } from "vitest";
import { boxFit, fitToBox, unitNormalize, type Point } from "./normalize";
import { pca2d } from "./pca";
import { mulberry32 } from "./prng";
import { alignLayout, applySimilarity, fitSimilarity } from "./procrustes";
import { runLayout, umapLayout, type PreviousLayout } from "./run-layout";

const DIMS = 64;

/** `perCluster` unit-ish vectors around each of `clusters` random centres. */
function clustered(clusters: number, perCluster: number, seed: number, spread = 0.15) {
  const random = mulberry32(seed);
  const gauss = () => (random() + random() + random() + random() - 2) * 1.2;
  const vectors: number[][] = [];
  const labels: number[] = [];
  for (let c = 0; c < clusters; c++) {
    const centre = Array.from({ length: DIMS }, gauss);
    for (let i = 0; i < perCluster; i++) {
      vectors.push(centre.map((v) => v + gauss() * spread));
      labels.push(c);
    }
  }
  return { vectors, labels };
}

const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Mean distance to same-cluster points divided by mean distance to the others (< 1 = clusters hold together). */
function cohesion(coords: Point[], labels: number[]) {
  let within = 0;
  let withinN = 0;
  let between = 0;
  let betweenN = 0;
  for (let i = 0; i < coords.length; i++) {
    for (let j = i + 1; j < coords.length; j++) {
      if (labels[i] === labels[j]) {
        within += dist(coords[i], coords[j]);
        withinN++;
      } else {
        between += dist(coords[i], coords[j]);
        betweenN++;
      }
    }
  }
  return within / withinN / (between / betweenN);
}

describe("mulberry32", () => {
  it("is deterministic per seed and stays in [0, 1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect([c(), c(), c()]).not.toEqual(first);
    for (const v of first) expect(v >= 0 && v < 1).toBe(true);
  });
});

describe("unitNormalize / fitToBox", () => {
  it("scales vectors to length 1 and leaves zero vectors alone", () => {
    const [a, zero] = unitNormalize([
      [3, 4],
      [0, 0],
    ]);
    expect(a).toEqual([0.6, 0.8]);
    expect(zero).toEqual([0, 0]);
  });

  it("fits points into [-1, 1] and keeps the aspect ratio", () => {
    const fitted = fitToBox(
      [
        [0, 0],
        [10, 0],
        [10, 2],
      ],
      0,
    );
    expect(fitted).toEqual([
      [-1, -0.2],
      [1, -0.2],
      [1, 0.2],
    ]);
  });

  it("reports the factor it scaled by", () => {
    const { points, scale } = boxFit([[0, 0], [10, 0]], 0);
    expect(points).toEqual([[-1, 0], [1, 0]]);
    expect(scale).toBeCloseTo(0.2, 12);
    expect(boxFit([]).scale).toBe(1);
  });

  it("handles a single point and no points", () => {
    expect(fitToBox([[5, 5]])).toEqual([[0, 0]]);
    expect(fitToBox([])).toEqual([]);
  });
});

describe("pca2d", () => {
  it("is deterministic and puts the widest spread on the first axis", () => {
    // Points along a line in 3D, with a little sideways wobble.
    const vectors = [-2, -1, 0, 1, 2].map((t, i) => [t, 2 * t, (i % 2 ? 0.1 : -0.1) * (i + 1)]);
    const a = pca2d(vectors);
    const b = pca2d(vectors);
    expect(a).toEqual(b);
    const spread = (axis: 0 | 1) => Math.max(...a.map((p) => p[axis])) - Math.min(...a.map((p) => p[axis]));
    expect(spread(0)).toBeGreaterThan(spread(1) * 5);
  });

  it("preserves pairwise distances for data that is really two-dimensional", () => {
    const flat: Point[] = [
      [0, 0],
      [3, 0],
      [0, 4],
      [3, 4],
    ];
    // Embed the plane into 5 dimensions.
    const vectors = flat.map(([x, y]) => [x, y, x + y, 2 * x - y, 7]);
    const projected = pca2d(vectors);
    const scale = dist(projected[0], projected[3]) / Math.hypot(...vectors[3].map((v, d) => v - vectors[0][d]));
    for (let i = 0; i < flat.length; i++) {
      for (let j = i + 1; j < flat.length; j++) {
        const original = Math.hypot(...vectors[i].map((v, d) => v - vectors[j][d]));
        expect(dist(projected[i], projected[j])).toBeCloseTo(original * scale, 6);
      }
    }
  });
});

describe("fitSimilarity", () => {
  const shape: Point[] = [
    [0, 0],
    [1, 0],
    [1, 2],
    [-1, 0.5],
    [0.3, -0.7],
  ];
  const transform = (points: Point[], angle: number, scale: number, shift: Point, mirror = false): Point[] =>
    points.map(([x, y]) => {
      const fy = mirror ? -y : y;
      return [
        scale * (x * Math.cos(angle) - fy * Math.sin(angle)) + shift[0],
        scale * (x * Math.sin(angle) + fy * Math.cos(angle)) + shift[1],
      ];
    });

  it("recovers a rotation, scale and shift exactly", () => {
    const target = transform(shape, 1.1, 0.7, [0.4, -0.2]);
    const fit = fitSimilarity(shape, target);
    expect(fit.reflected).toBe(false);
    applySimilarity(shape, fit).forEach((p, i) => {
      expect(p[0]).toBeCloseTo(target[i][0], 10);
      expect(p[1]).toBeCloseTo(target[i][1], 10);
    });
  });

  it("recovers a mirrored layout", () => {
    const target = transform(shape, -2.3, 1.4, [-0.1, 0.3], true);
    const fit = fitSimilarity(shape, target);
    expect(fit.reflected).toBe(true);
    applySimilarity(shape, fit).forEach((p, i) => {
      expect(p[0]).toBeCloseTo(target[i][0], 10);
      expect(p[1]).toBeCloseTo(target[i][1], 10);
    });
  });

  it("returns the identity for too few or degenerate points", () => {
    expect(fitSimilarity([[1, 1]], [[2, 2]])).toMatchObject({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });
    expect(
      fitSimilarity(
        [
          [1, 1],
          [1, 1],
        ],
        [
          [0, 0],
          [1, 1],
        ],
      ),
    ).toMatchObject({ a: 1, d: 1 });
  });
});

describe("alignLayout", () => {
  it("moves a rotated new layout back onto the old one, including ids that are new", () => {
    const previous = new Map<string, Point>([
      ["a", [0, 0]],
      ["b", [1, 0]],
      ["c", [0, 1]],
      ["d", [-1, -1]],
    ]);
    // The same picture turned by 90° and doubled, plus one extra term.
    const next = new Map<string, Point>([
      ["a", [0, 0]],
      ["b", [0, 2]],
      ["c", [-2, 0]],
      ["d", [2, -2]],
      ["baru", [0, 4]],
    ]);
    const { coords, shared, transform } = alignLayout(next, previous);
    expect(shared).toBe(4);
    expect(transform.reflected).toBe(false);
    for (const [id, old] of previous) {
      expect(coords.get(id)![0]).toBeCloseTo(old[0], 10);
      expect(coords.get(id)![1]).toBeCloseTo(old[1], 10);
    }
    expect(coords.get("baru")![0]).toBeCloseTo(2, 10);
    expect(coords.get("baru")![1]).toBeCloseTo(0, 10);
  });

  it("leaves the layout alone when fewer than three ids are shared", () => {
    const next = new Map<string, Point>([
      ["a", [0.5, 0.5]],
      ["x", [0, 0]],
    ]);
    const { coords, shared } = alignLayout(next, new Map<string, Point>([["a", [-1, -1]]]));
    expect(shared).toBe(1);
    expect(coords.get("a")).toEqual([0.5, 0.5]);
  });
});

describe("runLayout", () => {
  it("places one or two terms on a small circle", () => {
    expect(runLayout({ vectors: [[1, 0]], seed: 1 }).coords).toEqual([[0, 0]]);
    const two = runLayout({ vectors: [[1, 0], [0, 1]], seed: 1 });
    expect(two.params.method).toBe("circle");
    expect(dist(two.coords[0], two.coords[1])).toBeCloseTo(0.6, 10);
  });

  it("uses PCA below 15 terms, deterministically, inside the box", () => {
    const { vectors } = clustered(2, 5, 7);
    const a = runLayout({ vectors, seed: 1 });
    const b = runLayout({ vectors, seed: 999 });
    expect(a.params).toMatchObject({ method: "pca", n: 10 });
    expect(a.coords).toEqual(b.coords); // the seed does not matter for PCA
    for (const [x, y] of a.coords) expect(Math.abs(x) <= 1 && Math.abs(y) <= 1).toBe(true);
  });

  it("uses UMAP from 15 terms, repeatable with the same seed", () => {
    const { vectors } = clustered(3, 10, 11);
    const a = runLayout({ vectors, seed: 123 });
    const b = runLayout({ vectors, seed: 123 });
    const c = runLayout({ vectors, seed: 124 });
    expect(a.params).toMatchObject({ method: "umap", n: 30, nNeighbors: 15, minDist: 0.15, supervised: false, init: "pca" });
    expect(a.params.unitsPerBox).toBeGreaterThan(0);
    expect(a.coords).toEqual(b.coords);
    expect(a.coords).not.toEqual(c.coords);
    for (const [x, y] of a.coords) expect(Math.abs(x) <= 1 && Math.abs(y) <= 1).toBe(true);
  });

  it("keeps similar terms together and reports progress", () => {
    const { vectors, labels } = clustered(4, 20, 5);
    const progress: number[] = [];
    const { coords } = runLayout({ vectors, seed: 2026, onProgress: (p) => progress.push(p) });
    expect(cohesion(coords, labels)).toBeLessThan(0.5);
    expect(progress.at(-1)).toBe(1);
    expect(progress.length).toBeGreaterThan(10);
    expect([...progress].sort((x, y) => x - y)).toEqual(progress);
  });

  it("caps nNeighbors for small sets and honours supervision", () => {
    const { vectors, labels } = clustered(3, 5, 3);
    const plain = runLayout({ vectors, seed: 9 });
    expect(plain.params).toMatchObject({ method: "umap", nNeighbors: 14 });
    const guided = runLayout({ vectors, seed: 9, labels: labels.map((l, i) => (i % 3 === 0 ? -1 : l)) });
    expect(guided.params.supervised).toBe(true);
    expect(runLayout({ vectors, seed: 9, labels: labels.map(() => -1) }).params.supervised).toBe(false);
  });

  it("lays out 300 terms in well under five seconds", () => {
    const { vectors } = clustered(6, 50, 8);
    const wide = vectors.map((v) => [...v, ...v, ...v, ...v, ...v, ...v, ...v, ...v]); // 512 dimensions
    const started = performance.now();
    const { coords } = runLayout({ vectors: wide, seed: 1 });
    const ms = performance.now() - started;
    expect(coords).toHaveLength(300);
    expect(ms).toBeLessThan(5000);
  });
});

/** Median distance from a point to its nearest neighbour: how much of the box the points use. */
function medianNearest(coords: Point[]) {
  const nearest = coords.map((p, i) => Math.min(...coords.map((q, j) => (i === j ? Infinity : dist(p, q))))).sort((a, b) => a - b);
  return nearest[Math.floor(nearest.length / 2)];
}

/** Root-mean-square distance between a new layout and the old one over the ids they share, after aligning. */
function drift(next: Map<string, Point>, previous: Map<string, Point>) {
  const { coords } = alignLayout(next, previous);
  let sum = 0;
  for (const [id, p] of previous) sum += dist(coords.get(id) as Point, p) ** 2;
  return Math.sqrt(sum / previous.size);
}

describe("runLayout: a map that fills its box and stays recognisable", () => {
  // Six unrelated clusters of 25. Every sixth term is "new": it arrives after the first layout.
  const { vectors, labels } = clustered(6, 25, 21);
  const isOld = vectors.map((_, i) => i % 6 !== 5);
  const oldVectors = vectors.filter((_, i) => isOld[i]);
  const oldIds = vectors.map((_, i) => String(i)).filter((_, i) => isOld[i]);
  const first = runLayout({ vectors: oldVectors, seed: 5 });
  const firstMap = new Map(oldIds.map((id, k) => [id, first.coords[k]]));
  const asMap = (coords: Point[]) => new Map(coords.map((p, i) => [String(i), p]));
  const previous = {
    positions: vectors.map((_, i) => firstMap.get(String(i)) ?? null),
    fromLayout: isOld,
    params: first.params,
  };

  it("keeps unrelated clusters from drifting apart and shrinking to specks", () => {
    const tuning = { nNeighbors: 15, minDist: 0.15, spread: 1, anchor: 0 };
    const data = unitNormalize(oldVectors);
    const plain = fitToBox(umapLayout(data, { seed: 5, tuning: { ...tuning, gravity: 0 } }));
    expect(medianNearest(first.coords)).toBeGreaterThan(1.5 * medianNearest(plain));
    expect(cohesion(first.coords, labels.filter((_, i) => isOld[i]))).toBeLessThan(0.5);
  });

  it("starts a relayout from the current map, so every term stays close to where it was", () => {
    const warm = runLayout({ vectors, seed: 5, previous });
    const cold = runLayout({ vectors, seed: 5 });
    expect(warm.params.init).toBe("previous");
    expect(cold.params.init).toBe("pca");
    // Measured: 0.14 from the current map, 0.66 from scratch (the box is 2 wide).
    const warmDrift = drift(asMap(warm.coords), firstMap);
    expect(warmDrift).toBeLessThan(0.2);
    expect(warmDrift).toBeLessThan(0.5 * drift(asMap(cold.coords), firstMap));

    // The new terms settle inside their own cluster.
    let own = 0;
    let total = 0;
    warm.coords.forEach((p, i) => {
      if (isOld[i]) return;
      const nearest = warm.coords.map((q, j) => [dist(p, q), j] as const).filter(([, j]) => isOld[j]).sort((a, b) => a[0] - b[0])[0][1];
      total++;
      if (labels[nearest] === labels[i]) own++;
    });
    expect(own / total).toBeGreaterThan(0.9);
  });

  it("starts from scratch when the old map is no guide", () => {
    const run = (over: Partial<PreviousLayout>) => runLayout({ vectors, seed: 5, previous: { ...previous, ...over } }).params.init;
    // Mostly kNN estimates: fewer than half of the terms were placed by a layout.
    expect(run({ fromLayout: isOld.map((old, i) => old && i % 3 === 0) })).toBe("pca");
    // The old map was not made by UMAP, or its scale is unknown.
    expect(run({ params: { method: "pca", seed: 5, n: 10 } })).toBe("pca");
    expect(run({ params: { ...first.params, unitsPerBox: undefined } })).toBe("pca");
    expect(run({ params: null })).toBe("pca");
    // A different kind of layout was asked for ("Rapikan per bidang" switched on).
    expect(runLayout({ vectors, seed: 5, labels, previous }).params.init).toBe("pca");
  });
});
