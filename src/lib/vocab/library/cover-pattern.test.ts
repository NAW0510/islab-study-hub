import { describe, expect, it } from "vitest";
import { COVER_COLS, COVER_ROWS, coverPattern, seedOf, TILE_KINDS, TILE_PATHS } from "./cover-pattern";

describe("coverPattern", () => {
  it("draws the same cover for the same term and a different one for another", () => {
    expect(coverPattern("term-a")).toEqual(coverPattern("term-a"));
    expect(coverPattern("term-a")).not.toEqual(coverPattern("term-b"));
    expect(seedOf("term-a")).toBe(seedOf("term-a"));
  });

  it("keeps every tile inside the grid, once per cell, with a known shape, ink and turn", () => {
    for (const seed of ["a", "tensor", "0b9f6c4e-2a71-4d8c-9e43-7f1a2b3c4d5e"]) {
      const tiles = coverPattern(seed);
      const cells = new Set(tiles.map((t) => `${t.col}:${t.row}`));
      expect(cells.size).toBe(tiles.length);
      for (const t of tiles) {
        expect(t.col).toBeGreaterThanOrEqual(0);
        expect(t.col).toBeLessThan(COVER_COLS);
        expect(t.row).toBeGreaterThanOrEqual(0);
        expect(t.row).toBeLessThan(COVER_ROWS);
        expect(TILE_KINDS).toContain(t.kind);
        expect(["main", "deep"]).toContain(t.ink);
        expect([0, 90, 180, 270]).toContain(t.rotation);
      }
    }
  });

  it("leaves some paper, mostly in the main colour, over many covers", () => {
    let cells = 0;
    let filled = 0;
    let deep = 0;
    for (let i = 0; i < 200; i++) {
      const tiles = coverPattern(`term-${i}`);
      cells += COVER_COLS * COVER_ROWS;
      filled += tiles.length;
      deep += tiles.filter((t) => t.ink === "deep").length;
    }
    expect(filled / cells).toBeGreaterThan(0.72);
    expect(filled / cells).toBeLessThan(0.92);
    expect(deep / filled).toBeGreaterThan(0.2);
    expect(deep / filled).toBeLessThan(0.4);
  });

  it("has a path for every shape", () => {
    for (const kind of TILE_KINDS) expect(TILE_PATHS[kind]).toMatch(/^M[\d .,A-Z-]+$/);
  });
});
