import { describe, expect, it } from "vitest";
import raw from "./countries.json";
import { countryAt, decodeAtlas, focusFrame, inRing, MAP_HEIGHT, project, unproject, type RawAtlas } from "./geo";

const data = decodeAtlas(raw as RawAtlas);

describe("decodeAtlas", () => {
  it("decodes every country with sane boxes", () => {
    expect(data.countries.length).toBeGreaterThan(220);
    const jp = data.byCode.get("JP");
    expect(jp?.name).toBe("Jepang");
    const [w, s, e, n] = jp!.bbox;
    expect(w).toBeGreaterThan(122);
    expect(e).toBeLessThan(155);
    expect(s).toBeGreaterThan(20);
    expect(n).toBeLessThan(46);
  });

  it("leaves Antarctica out and joins Somaliland to Somalia", () => {
    expect(data.byCode.has("AQ")).toBe(false);
    expect(data.countries.filter((c) => c.code === "SO")).toHaveLength(1);
    expect(countryAt(data, 46.7, 9.4)?.code).toBe("SO");
  });
});

describe("countryAt", () => {
  it("finds countries at their label points, small ones included", () => {
    for (const code of ["JP", "ID", "FR", "BR", "SG", "LU", "IS"]) {
      const c = data.byCode.get(code)!;
      expect(countryAt(data, c.label[0], c.label[1])?.code, code).toBe(code);
    }
  });

  it("respects holes: Lesotho inside South Africa", () => {
    const ls = data.byCode.get("LS")!;
    expect(countryAt(data, ls.label[0], ls.label[1])?.code).toBe("LS");
  });

  it("is null at sea", () => {
    expect(countryAt(data, -30, 0)).toBeNull(); // mid-Atlantic
    expect(countryAt(data, 160, -30)).toBeNull(); // Tasman Sea
  });
});

describe("projection", () => {
  it("round-trips and keeps the map's proportions", () => {
    const [x, y] = project(139.7, 35.7);
    const [lon, lat] = unproject(x, y);
    expect(lon).toBeCloseTo(139.7, 6);
    expect(lat).toBeCloseTo(35.7, 6);
    expect(MAP_HEIGHT).toBeCloseTo((7.4 * 141) / 360, 6);
  });

  it("inRing works on a flat square", () => {
    const square = [0, 0, 10, 0, 10, 10, 0, 10];
    expect(inRing(5, 5, square)).toBe(true);
    expect(inRing(15, 5, square)).toBe(false);
  });
});

describe("focusFrame", () => {
  it("frames the main land only: France without Guiana, the US without Alaska", () => {
    const fr = focusFrame(data.byCode.get("FR")!);
    expect(fr.lon).toBeGreaterThan(-6);
    expect(fr.width).toBeLessThan(16);
    const us = focusFrame(data.byCode.get("US")!);
    expect(us.lon).toBeGreaterThan(-110);
    expect(us.lon).toBeLessThan(-85);
  });

  it("never frames less than the minimum span", () => {
    const sg = focusFrame(data.byCode.get("SG")!, 6);
    expect(sg.width).toBe(6);
  });
});
