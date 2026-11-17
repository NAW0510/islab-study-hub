import { describe, expect, it } from "vitest";
import { mulberry32 } from "./prng";
import { boxFit3, pca3d, runLayout3d, umapLayout3d, type Point3 } from "./run-layout-3d";
import { unitNormalize } from "./normalize";

const DIMS = 64;

/** `perCluster` vectors around each of `clusters` random centres. */
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

const dist = (a: Point3, b: Point3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const inBox = (coords: Point3[]) => coords.every((p) => p.every((x) => Math.abs(x) <= 1 + 1e-9));

/** Mean distance within clusters divided by mean distance between them (< 1 = clusters hold together). */
function cohesion(coords: Point3[], labels: number[]) {
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

describe("pca3d / boxFit3", () => {
  it("is deterministic, uses three axes, and orders them by spread", () => {
    const { vectors } = clustered(4, 3, 3);
    const a = pca3d(unitNormalize(vectors));
    expect(pca3d(unitNormalize(vectors))).toEqual(a);
    const spread = [0, 1, 2].map((axis) => Math.max(...a.map((p) => p[axis])) - Math.min(...a.map((p) => p[axis])));
    expect(spread[2]).toBeGreaterThan(0);
    expect(spread[0]).toBeGreaterThanOrEqual(spread[1] * 0.99);
  });

  it("leaves a missing third axis at zero for three points", () => {
    const coords = pca3d([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]]);
    expect(coords.every((p) => Math.abs(p[2]) < 1e-9)).toBe(true);
  });

  it("fits into the cube, keeps proportions and reports the scale", () => {
    const { points, scale } = boxFit3([[0, 0, 0], [10, 2, 4]], 0);
    expect(points).toEqual([[-1, -0.2, -0.4], [1, 0.2, 0.4]]);
    expect(scale).toBeCloseTo(0.2, 12);
    expect(boxFit3([]).points).toEqual([]);
  });
});

describe("runLayout3d", () => {
  it("uses a fixed small shape, then PCA, then UMAP", () => {
    expect(runLayout3d({ vectors: [[1, 0]] })).toMatchObject({ coords: [[0, 0, 0]], method: "small" });
    expect(runLayout3d({ vectors: [[1, 0], [0, 1]] }).coords).toHaveLength(2);
    const few = runLayout3d({ vectors: clustered(2, 5, 7).vectors });
    expect(few.method).toBe("pca");
    expect(inBox(few.coords)).toBe(true);
    const many = runLayout3d({ vectors: clustered(3, 10, 11).vectors });
    expect(many).toMatchObject({ method: "umap", init: "pca" });
    expect(many.unitsPerBox).toBeGreaterThan(0);
    expect(inBox(many.coords)).toBe(true);
  });

  it("gives the same space for the same terms (fixed seed), and keeps clusters together", () => {
    const { vectors, labels } = clustered(4, 20, 5);
    const progress: number[] = [];
    const a = runLayout3d({ vectors, onProgress: (p) => progress.push(p) });
    expect(runLayout3d({ vectors }).coords).toEqual(a.coords);
    expect(cohesion(a.coords, labels)).toBeLessThan(0.5);
    expect(progress.at(-1)).toBe(1);
  });

  it("keeps unrelated clusters from drifting apart and shrinking to specks", () => {
    const { vectors } = clustered(6, 25, 21);
    const data = unitNormalize(vectors);
    const tuning = { nNeighbors: 15, minDist: 0.15, spread: 1, anchor: 0 };
    const plain = boxFit3(umapLayout3d(data, { seed: 3, tuning: { ...tuning, gravity: 0 } })).points;
    const nearest = (coords: Point3[]) =>
      coords.map((p, i) => Math.min(...coords.map((q, j) => (i === j ? Infinity : dist(p, q))))).sort((x, y) => x - y)[75];
    expect(nearest(runLayout3d({ vectors }).coords)).toBeGreaterThan(1.5 * nearest(plain));
  });

  it("starts from the earlier space when terms are added, so known terms stay close to their place", () => {
    const { vectors, labels } = clustered(6, 25, 21);
    const isOld = vectors.map((_, i) => i % 6 !== 5);
    const first = runLayout3d({ vectors: vectors.filter((_, i) => isOld[i]) });
    const firstById = new Map(vectors.map((_, i) => i).filter((i) => isOld[i]).map((i, k) => [i, first.coords[k]]));
    const previous = { positions: vectors.map((_, i) => firstById.get(i) ?? null), unitsPerBox: first.unitsPerBox };

    const warm = runLayout3d({ vectors, previous });
    const cold = runLayout3d({ vectors, seed: 4 });
    expect(warm.init).toBe("previous");
    const drift = (coords: Point3[]) =>
      Math.sqrt([...firstById].reduce((sum, [i, p]) => sum + dist(coords[i], p) ** 2, 0) / firstById.size);
    // No alignment step: a warm start must stay put on its own; a cold one lands anywhere.
    expect(drift(warm.coords)).toBeLessThan(0.25);
    expect(drift(warm.coords)).toBeLessThan(0.5 * drift(cold.coords));

    // New terms settle in their own cluster.
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

  it("starts fresh when the earlier space is no guide", () => {
    const { vectors } = clustered(3, 10, 11);
    const some = vectors.map((_, i) => (i < 5 ? ([0, 0, 0] as Point3) : null));
    expect(runLayout3d({ vectors, previous: { positions: some, unitsPerBox: 5 } }).init).toBe("pca");
    expect(runLayout3d({ vectors, previous: { positions: vectors.map(() => [0, 0, 0] as Point3), unitsPerBox: null } }).init).toBe("pca");
  });

  it("lays out 300 terms in well under five seconds", () => {
    const { vectors } = clustered(6, 50, 8);
    const wide = vectors.map((v) => [...v, ...v, ...v, ...v, ...v, ...v, ...v, ...v]); // 512 dimensions
    const started = performance.now();
    const { coords } = runLayout3d({ vectors: wide });
    expect(coords).toHaveLength(300);
    expect(performance.now() - started).toBeLessThan(5000);
  });
});
