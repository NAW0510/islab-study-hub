import { describe, expect, it } from "vitest";
import type { VocabDomain } from "../types";
import type { Point3 } from "./layout/run-layout-3d";
import {
  CACHE_KEY,
  fingerprint,
  groups3d,
  paddedCloud3d,
  pickNearest,
  readCache,
  sphereDirections,
  visible3d,
  withoutOutliers3d,
  writeCache,
} from "./map3d-model";
import type { MapPoint } from "./map-model";

const domain = (id: string, name: string, parent_id: string | null = null): VocabDomain => ({
  id,
  name,
  description: "",
  color: "domain-1",
  parent_id,
  created_at: "",
  updated_at: "",
});
const domains = new Map([domain("ml", "Machine Learning"), domain("dl", "Deep Learning", "ml"), domain("st", "Statistika")].map((d) => [d.id, d]));

const point = (id: string, over: Partial<MapPoint> = {}): MapPoint => ({
  id,
  term: id,
  aliases: [],
  domain_id: "dl",
  domain_source: "auto",
  learned_on: "2026-10-01",
  snippet: "",
  has_embedding: true,
  map_x: 0.1,
  map_y: 0.2,
  map_placed: "layout",
  ...over,
});

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  };
}

describe("fingerprint", () => {
  it("ignores order and domain changes, but notices new terms and re-embedded ones", () => {
    const base = fingerprint([point("a"), point("b")]);
    expect(fingerprint([point("b"), point("a")])).toBe(base);
    expect(fingerprint([point("a", { domain_id: "st" }), point("b")])).toBe(base);
    expect(fingerprint([point("a"), point("b"), point("c")])).not.toBe(base);
    expect(fingerprint([point("a", { map_x: null, map_y: null, has_embedding: false }), point("b")])).not.toBe(base);
    expect(fingerprint([point("a", { map_x: 0.3 }), point("b")])).not.toBe(base);
  });
});

describe("readCache / writeCache", () => {
  it("round-trips, rounding coordinates", () => {
    const storage = memoryStorage();
    expect(writeCache(storage, { fingerprint: "f", unitsPerBox: 4.2, coords: { a: [0.123456, -1, 0.5] } })).toBe(true);
    expect(readCache(storage)).toEqual({ v: 1, fingerprint: "f", unitsPerBox: 4.2, coords: { a: [0.1235, -1, 0.5] } });
  });

  it("treats missing, broken or foreign data as no cache, and never throws", () => {
    const storage = memoryStorage();
    expect(readCache(storage)).toBeNull();
    expect(readCache(null)).toBeNull();
    storage.data.set(CACHE_KEY, "{not json");
    expect(readCache(storage)).toBeNull();
    storage.data.set(CACHE_KEY, JSON.stringify({ v: 2, fingerprint: "f", coords: {} }));
    expect(readCache(storage)).toBeNull();
    storage.data.set(CACHE_KEY, JSON.stringify({ v: 1, fingerprint: "f", unitsPerBox: -1, coords: { a: [1, 2], b: [0, 0, 0] } }));
    expect(readCache(storage)).toEqual({ v: 1, fingerprint: "f", unitsPerBox: null, coords: { b: [0, 0, 0] } });

    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(readCache(throwing)).toBeNull();
    expect(writeCache(throwing, { fingerprint: "f", unitsPerBox: null, coords: {} })).toBe(false);
  });
});

describe("visible3d / groups3d", () => {
  const coords = new Map<string, Point3>([
    ["w1", [0, 0, 0]],
    ["w3", [1, 1, 1]],
    ["stat", [-1, 0, 0]],
    ["none", [0, 0, 1]],
  ]);
  const points = [
    point("w1"),
    point("w3", { learned_on: "2026-10-12" }),
    point("stat", { domain_id: "st" }),
    point("none", { domain_id: null }),
    point("no-position"),
  ];
  const base = { programStart: "2026-09-28", domains, hiddenFields: new Set<string>() };

  it("shows positioned terms up to the chosen week, minus hidden fields", () => {
    expect(visible3d(points, coords, { ...base, week: 2 }).map((p) => p.id)).toEqual(["w1", "stat", "none"]);
    expect(visible3d(points, coords, { ...base, week: 9, hiddenFields: new Set(["ml", "none"]) }).map((p) => p.id)).toEqual(["stat"]);
  });

  it("groups by field or by branch, coloured by the field, with the label at the mean", () => {
    const fields = groups3d(points, coords, "bidang", domains);
    expect(fields.find((g) => g.group.id === "ml")).toMatchObject({ members: [[0, 0, 0], [1, 1, 1]], centre: [0.5, 0.5, 0.5] });
    expect(fields.find((g) => g.group.id === "st")?.centre).toEqual([-1, 0, 0]);
    expect(fields).toHaveLength(2);

    const branches = groups3d(points, coords, "cabang", domains);
    const dl = branches.find((g) => g.group.id === "dl");
    expect(dl?.field.id).toBe("ml");
    expect(groups3d(points, coords, "none", domains)).toEqual([]);
  });
});

describe("pickNearest", () => {
  it("takes the nearest point within the radius, and nothing outside it", () => {
    const projected = [
      { id: "a", x: 100, y: 100, depth: 0.5 },
      { id: "b", x: 120, y: 100, depth: 0.1 },
    ];
    expect(pickNearest(projected, 103, 100, 14)?.id).toBe("a");
    expect(pickNearest(projected, 160, 100, 14)).toBeNull();
  });

  it("prefers the point in front when two are equally near on screen", () => {
    const projected = [
      { id: "behind", x: 100, y: 100, depth: 0.8 },
      { id: "front", x: 102, y: 101, depth: 0.2 },
    ];
    expect(pickNearest(projected, 100, 100, 14)?.id).toBe("front");
  });

  it("ignores points outside the view", () => {
    expect(pickNearest([{ id: "a", x: 100, y: 100, depth: 1.5 }], 100, 100, 14)).toBeNull();
  });
});

describe("regions", () => {
  it("drops a far-away stray term, keeps small groups whole", () => {
    const cluster: Point3[] = [[0, 0, 0], [0.1, 0, 0], [0, 0.1, 0], [0, 0, 0.1], [0.1, 0.1, 0], [0.05, 0.05, 0.05]];
    const stray: Point3 = [1, 1, 1];
    expect(withoutOutliers3d([...cluster, stray])).toEqual(cluster);
    expect(withoutOutliers3d([[0, 0, 0], [1, 1, 1], [0.1, 0, 0]])).toHaveLength(3);
  });

  it("spreads directions evenly over the unit sphere", () => {
    const directions = sphereDirections(26);
    expect(directions).toHaveLength(26);
    for (const d of directions) expect(Math.hypot(...d)).toBeCloseTo(1, 10);
    const mean = [0, 1, 2].map((a) => directions.reduce((sum, d) => sum + d[a], 0) / directions.length);
    for (const m of mean) expect(Math.abs(m)).toBeLessThan(0.05);
  });

  it("puffs every point into a small sphere", () => {
    const cloud = paddedCloud3d([[0, 0, 0], [1, 0, 0]], 0.1, sphereDirections(8));
    expect(cloud).toHaveLength(16);
    for (const p of cloud.slice(0, 8)) expect(Math.hypot(...p)).toBeCloseTo(0.1, 10);
  });
});
