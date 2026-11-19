import { describe, expect, it } from "vitest";
import { easeInOutCubic, easeOutCubic, easeOutQuart, introCamera, introKind, seenViews, segment, shortPath } from "./intro";

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
    for (const ease of [easeOutCubic, easeOutQuart, easeInOutCubic]) {
      expect(ease(0)).toBeCloseTo(0, 9);
      expect(ease(1)).toBeCloseTo(1, 9);
    }
  });
});

describe("introCamera", () => {
  const path = { dolly: 2.4, orbit: 0.9, rise: 0.3 };

  it("starts farther, round and higher, and lands exactly on the frame", () => {
    expect(introCamera(0, path)).toEqual({ distance: 2.4, azimuth: 0.9, elevation: 0.3 });
    const end = introCamera(1, path);
    expect(end.distance).toBeCloseTo(1, 9);
    expect(end.azimuth).toBeCloseTo(0, 9);
    expect(end.elevation).toBeCloseTo(0, 9);
  });

  it("comes in steadily: never backs off or turns back", () => {
    let last = introCamera(0, path);
    for (let i = 1; i <= 100; i++) {
      const now = introCamera(i / 100, path);
      expect(now.distance).toBeLessThanOrEqual(last.distance + 1e-12);
      expect(now.azimuth).toBeLessThanOrEqual(last.azimuth + 1e-12);
      expect(now.elevation).toBeLessThanOrEqual(last.elevation + 1e-12);
      last = now;
    }
  });

  it("has no speed left at the end, so the hand-over to the auto-turn is smooth", () => {
    const a = introCamera(0.999, path);
    const b = introCamera(1, path);
    expect(Math.abs(a.distance - b.distance)).toBeLessThan(1e-4);
    expect(Math.abs(a.azimuth - b.azimuth)).toBeLessThan(1e-4);
  });

  it("clamps outside 0…1", () => {
    expect(introCamera(-1, path)).toEqual(introCamera(0, path));
    expect(introCamera(2, path)).toEqual(introCamera(1, path));
  });

  it("a short intro takes the same way in, much nearer", () => {
    const short = shortPath(path);
    expect(short.dolly).toBeCloseTo(1.28, 9);
    expect(short.orbit).toBeCloseTo(0.15, 9);
    expect(short.rise).toBeCloseTo(0.05, 9);
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
