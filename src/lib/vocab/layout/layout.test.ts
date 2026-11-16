import { describe, expect, it } from "vitest";
import { fitToBox, unitNormalize, type Point } from "./normalize";
import { pca2d } from "./pca";
import { mulberry32 } from "./prng";
import { alignLayout, applySimilarity, fitSimilarity } from "./procrustes";
import { runLayout } from "./run-layout";

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
    expect(a.params).toMatchObject({ method: "umap", n: 30, nNeighbors: 15, minDist: 0.15, supervised: false });
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
