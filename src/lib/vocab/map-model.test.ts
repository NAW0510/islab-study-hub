import { describe, expect, it } from "vitest";
import type { VocabDomain } from "../types";
import { fieldOf, firstSentence, groupOf, layoutAdvice, mapStats, visiblePoints, type MapPoint } from "./map-model";

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

const START = "2026-09-28";
const point = (id: string, over: Partial<MapPoint> = {}): MapPoint => ({
  id,
  term: id,
  aliases: [],
  domain_id: "dl",
  domain_source: "auto",
  learned_on: "2026-10-01",
  snippet: "",
  has_embedding: true,
  map_x: 0,
  map_y: 0,
  map_placed: "layout",
  ...over,
});

describe("fieldOf / groupOf", () => {
  it("resolves a branch to its field and a field to itself", () => {
    expect(fieldOf("dl", domains)?.id).toBe("ml");
    expect(fieldOf("st", domains)?.id).toBe("st");
    expect(fieldOf(null, domains)).toBeNull();
    expect(fieldOf("hilang", domains)).toBeNull();
  });

  it("groups by field, by branch, or not at all", () => {
    expect(groupOf({ domain_id: "dl" }, "bidang", domains)?.id).toBe("ml");
    expect(groupOf({ domain_id: "dl" }, "cabang", domains)?.id).toBe("dl");
    expect(groupOf({ domain_id: "dl" }, "none", domains)).toBeNull();
    expect(groupOf({ domain_id: null }, "bidang", domains)).toBeNull();
  });
});

describe("visiblePoints", () => {
  const points = [
    point("w1"), // Week 1
    point("w3", { learned_on: "2026-10-12" }), // Week 3
    point("stat", { domain_id: "st" }),
    point("tanpa-posisi", { map_x: null, map_y: null, map_placed: null }),
    point("tanpa-domain", { domain_id: null, domain_source: "pending" }),
  ];
  const base = { programStart: START, domains, hiddenFields: new Set<string>() };

  it("hides terms learned after the chosen week and terms without a position", () => {
    expect(visiblePoints(points, { ...base, week: 2 }).map((p) => p.id)).toEqual(["w1", "stat", "tanpa-domain"]);
    expect(visiblePoints(points, { ...base, week: 3 }).map((p) => p.id)).toContain("w3");
  });

  it("hides fields switched off in the legend, including their branches and the no-domain group", () => {
    expect(visiblePoints(points, { ...base, week: 9, hiddenFields: new Set(["ml"]) }).map((p) => p.id)).toEqual(["stat", "tanpa-domain"]);
    expect(visiblePoints(points, { ...base, week: 9, hiddenFields: new Set(["none"]) }).map((p) => p.id)).not.toContain("tanpa-domain");
  });
});

describe("layoutAdvice", () => {
  const many = (n: number, over: Partial<MapPoint> = {}) => Array.from({ length: n }, (_, i) => point(`p${i}`, over));

  it("asks for more terms below five", () => {
    expect(layoutAdvice(many(4))).toEqual({ kind: "empty", total: 4 });
  });

  it("offers the first layout when nothing has a position", () => {
    expect(layoutAdvice(many(8, { map_x: null, map_y: null, map_placed: null }))).toEqual({ kind: "first", ready: 8 });
  });

  it("is quiet while few terms were added by kNN", () => {
    expect(layoutAdvice([...many(40), ...many(9, { map_placed: "knn" })])).toEqual({ kind: "ok" });
  });

  it("suggests a relayout from max(10, 15%) kNN terms", () => {
    expect(layoutAdvice([...many(40), ...many(10, { map_placed: "knn" })])).toEqual({ kind: "stale", knn: 10, unplaced: 0 });
    // 200 terms: 15% = 30, so 20 kNN terms are still fine.
    expect(layoutAdvice([...many(180), ...many(20, { map_placed: "knn" })])).toEqual({ kind: "ok" });
    expect(layoutAdvice([...many(170), ...many(30, { map_placed: "knn" })]).kind).toBe("stale");
  });

  it("suggests a relayout when embedded terms still lack a position", () => {
    expect(layoutAdvice([...many(10), point("baru", { map_x: null, map_y: null, map_placed: null })])).toEqual({
      kind: "stale",
      knn: 0,
      unplaced: 1,
    });
  });

  it("ignores terms that are not embedded yet", () => {
    expect(layoutAdvice([...many(10), point("belum", { has_embedding: false, map_x: null, map_y: null, map_placed: null })])).toEqual({ kind: "ok" });
  });
});

describe("mapStats", () => {
  it("counts terms, used domains, this week's terms and the biggest field", () => {
    const stats = mapStats(
      [point("a"), point("b", { domain_id: "ml" }), point("c", { domain_id: "st", learned_on: "2026-11-16" }), point("d", { domain_id: null })],
      { programStart: START, currentWeek: 8, domains },
    );
    expect(stats).toEqual({ total: 4, activeDomains: 3, thisWeek: 1, biggestField: { name: "Machine Learning", count: 2 } });
  });

  it("has no biggest field without domains", () => {
    expect(mapStats([point("d", { domain_id: null })], { programStart: START, currentWeek: 1, domains }).biggestField).toBeNull();
  });
});

describe("firstSentence", () => {
  it("returns the first sentence, or a shortened text", () => {
    expect(firstSentence("Struktur data multidimensi. Dipakai di jaringan saraf.")).toBe("Struktur data multidimensi.");
    expect(firstSentence("tanpa   titik\ndi akhir")).toBe("tanpa titik di akhir");
    expect(firstSentence("kata ".repeat(60), 30).endsWith("…")).toBe(true);
  });
});
