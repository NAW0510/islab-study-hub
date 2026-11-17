import { describe, expect, it } from "vitest";
import type { VocabDomain } from "../types";
import type { Point3 } from "./layout/run-layout-3d";
import { CACHE_KEY, fieldCentres, fingerprint, pickNearest, readCache, visible3d, writeCache } from "./map3d-model";
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

describe("visible3d / fieldCentres", () => {
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

  it("puts each field's label at the mean of its terms", () => {
    const centres = fieldCentres(points, coords, domains);
    expect(centres.find((c) => c.field.id === "ml")).toMatchObject({ count: 2, centre: [0.5, 0.5, 0.5] });
    expect(centres.find((c) => c.field.id === "st")).toMatchObject({ count: 1, centre: [-1, 0, 0] });
    expect(centres).toHaveLength(2);
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
