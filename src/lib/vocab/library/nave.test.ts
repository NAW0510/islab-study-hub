import { describe, expect, it } from "vitest";
import { naveHalfWidth, railInnerEdge } from "./nave";

describe("the nave keeps the river clear of the gallery rails", () => {
  // Canvas width, height, and the river's width as the page lays it out.
  const screens: [string, number, number, number][] = [
    ["phone", 390, 844, 358],
    ["tablet", 1024, 768, 880],
    ["laptop", 1368, 900, 944],
    ["wide", 1840, 1080, 1104],
  ];

  it.each(screens)("%s: the rail's inner face is outside the river's edge", (_, width, height, river) => {
    const nave = naveHalfWidth(width, height, river);
    expect(railInnerEdge(nave, height)).toBeGreaterThan(river / 2);
  });

  it("still fills a share of a wide canvas when the river is narrow", () => {
    expect(naveHalfWidth(1600, 900, 200)).toBe(480);
  });
});
