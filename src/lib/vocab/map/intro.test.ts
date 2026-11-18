import { describe, expect, it } from "vitest";
import { easeInOutCubic, easeOutBack, easeOutCubic, introKind, seenViews, segment } from "./intro";

describe("introKind", () => {
  it("plays the full intro on a fresh visit", () => {
    expect(introKind({ seen: false, switching: false, reducedMotion: false })).toBe("full");
  });

  it("plays the short one for a view already seen, or when switching views", () => {
    expect(introKind({ seen: true, switching: false, reducedMotion: false })).toBe("short");
    expect(introKind({ seen: false, switching: true, reducedMotion: false })).toBe("short");
  });

  it("plays nothing with reduced motion", () => {
    expect(introKind({ seen: false, switching: false, reducedMotion: true })).toBe("instant");
  });
});

describe("segment", () => {
  it("maps a part of the timeline to 0…1", () => {
    expect(segment(0.1, 0.2, 0.6)).toBe(0);
    expect(segment(0.4, 0.2, 0.6)).toBeCloseTo(0.5, 9);
    expect(segment(0.9, 0.2, 0.6)).toBe(1);
  });

  it("treats an empty part as a step", () => {
    expect(segment(0.4, 0.5, 0.5)).toBe(0);
    expect(segment(0.5, 0.5, 0.5)).toBe(1);
  });
});

describe("easings", () => {
  it("start at 0 and end at 1", () => {
    for (const ease of [easeOutCubic, easeInOutCubic, easeOutBack]) {
      expect(ease(0)).toBeCloseTo(0, 9);
      expect(ease(1)).toBeCloseTo(1, 9);
    }
  });

  it("the brain's landing overshoots a little, then settles", () => {
    expect(Math.max(...Array.from({ length: 50 }, (_, i) => easeOutBack(i / 49)))).toBeGreaterThan(1);
  });
});

describe("seenViews", () => {
  it("reads the views whose full intro played", () => {
    expect([...seenViews('["space","brain"]')]).toEqual(["space", "brain"]);
  });

  it("tolerates nothing and junk", () => {
    expect(seenViews(null).size).toBe(0);
    expect(seenViews("{nope").size).toBe(0);
    expect(seenViews('{"a":1}').size).toBe(0);
  });
});
