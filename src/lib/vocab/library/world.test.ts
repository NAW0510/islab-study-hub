import { describe, expect, it } from "vitest";
import { LIBRARY_CONFIG } from "./config";
import { foldAmount, foldDepth, foldLine, swell } from "./fold";
import { QualityGovernor, qualityLadder } from "./quality";
import { awakeCards, type WakeCard } from "./wake";
import { decideWorldMode, isSoftwareRenderer } from "./world-mode";

describe("decideWorldMode", () => {
  const gpu = { reducedMotion: false, noWorld: false, hasWebGL2: true, renderer: "ANGLE (NVIDIA GeForce RTX 4060, D3D11)" };

  it("runs the world on a hardware GPU with motion allowed", () => {
    expect(decideWorldMode(gpu)).toBe("gl");
  });

  it("keeps the DOM page for reduced motion, ?noworld, no WebGL2 and software renderers", () => {
    expect(decideWorldMode({ ...gpu, reducedMotion: true })).toBe("dom");
    expect(decideWorldMode({ ...gpu, noWorld: true })).toBe("dom");
    expect(decideWorldMode({ ...gpu, hasWebGL2: false })).toBe("dom");
    for (const name of ["Google SwiftShader", "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))", "llvmpipe (LLVM 15.0.7, 256 bits)", "Microsoft Basic Render Driver"]) {
      expect(isSoftwareRenderer(name)).toBe(true);
      expect(decideWorldMode({ ...gpu, renderer: name })).toBe("dom");
    }
    expect(isSoftwareRenderer(null)).toBe(false);
  });
});

describe("fold and swell", () => {
  const head = 200;
  const vh = 900;
  const line = foldLine(head, vh);

  it("leaves the river flat below the fold line and folds it fully a zone above", () => {
    expect(line).toBeCloseTo(head + LIBRARY_CONFIG.sheet.FOLD_GAP * vh, 9);
    expect(foldAmount(line + 1, head, vh)).toBe(0);
    expect(foldAmount(800, head, vh)).toBe(0);
    expect(foldAmount(line - LIBRARY_CONFIG.sheet.FOLD_ZONE * vh, head, vh)).toBeCloseTo(1, 9);
    expect(foldAmount(-500, head, vh)).toBe(1);
  });

  it("rises smoothly and only one way", () => {
    let last = 0;
    for (let y = line; y > line - LIBRARY_CONFIG.sheet.FOLD_ZONE * vh; y -= 5) {
      const t = foldAmount(y, head, vh);
      expect(t).toBeGreaterThanOrEqual(last);
      expect(t - last).toBeLessThan(0.03);
      last = t;
    }
    expect(foldDepth(0)).toBe(0);
    expect(foldDepth(1)).toBe(LIBRARY_CONFIG.sheet.FOLD_DEPTH);
    expect(foldDepth(0.5)).toBeLessThan(LIBRARY_CONFIG.sheet.FOLD_DEPTH / 2);
  });

  it("swells between 0 and the crest, periodically", () => {
    const { SWELL, SWELL_PERIOD } = LIBRARY_CONFIG.sheet;
    for (let i = 0; i < 50; i++) {
      const z = swell(i * 37, i * 53, i * 0.7);
      expect(z).toBeGreaterThanOrEqual(0);
      expect(z).toBeLessThanOrEqual(SWELL);
    }
    expect(swell(120, 340, 2)).toBeCloseTo(swell(120, 340, 2 + SWELL_PERIOD), 9);
  });
});

describe("awakeCards", () => {
  const cards: WakeCard[] = Array.from({ length: 60 }, (_, i) => ({ id: `c${i}`, top: i * 300, bottom: i * 300 + 260 }));
  const vh = 900;

  it("wakes the cards near the screen, more below than above", () => {
    const awake = awakeCards(cards, new Set(), 3000, vh);
    expect(awake.has("c10")).toBe(true); // on screen
    expect(awake.has("c7")).toBe(true); // within one viewport above
    expect(awake.has("c6")).toBe(false); // further above
    expect(awake.has("c19")).toBe(true); // within 2.1 viewports below
    expect(awake.has("c20")).toBe(false);
  });

  it("keeps a card awake until it is well away (hysteresis)", () => {
    const first = awakeCards(cards, new Set(), 3000, vh);
    const later = awakeCards(cards, first, 3600, vh);
    expect(later.has("c7")).toBe(true); // out of the wake band, still inside the sleep band
    expect(awakeCards(cards, later, 6000, vh).has("c7")).toBe(false);
  });

  it("never wakes more than the cap, and drops the farthest first", () => {
    const dense: WakeCard[] = Array.from({ length: 200 }, (_, i) => ({ id: `d${i}`, top: i * 40, bottom: i * 40 + 30 }));
    const awake = awakeCards(dense, new Set(), 2000, vh);
    expect(awake.size).toBe(LIBRARY_CONFIG.wake.MAX_AWAKE);
    expect(awake.has("d60")).toBe(true); // near the centre of the screen
  });
});

describe("QualityGovernor", () => {
  const frames = (g: QualityGovernor, ms: number, seconds: number) => {
    const verdicts = [];
    for (let t = 0; t < seconds * 1000; t += ms) verdicts.push(g.sample(ms, true));
    return verdicts;
  };

  it("builds a ladder from the device ratio down, then thins the scene", () => {
    const ladder = qualityLadder(2);
    expect(ladder[0]).toEqual({ pixelRatio: 2, tier: "high" });
    expect(ladder.at(-1)).toEqual({ pixelRatio: 1, tier: "low" });
    expect(qualityLadder(1)[0]).toEqual({ pixelRatio: 1, tier: "high" });
  });

  it("keeps a smooth world and steps a slow one down, never up", () => {
    const smooth = new QualityGovernor(qualityLadder(2));
    expect(frames(smooth, 16, 6)).not.toContain("lower");

    const slow = new QualityGovernor(qualityLadder(2));
    const verdicts = frames(slow, 30, 4);
    expect(verdicts).toContain("lower");
    expect(slow.level.pixelRatio).toBeLessThan(2);
    const reached = slow.level;
    frames(slow, 16, 6);
    expect(slow.level).toEqual(reached);
  });

  it("ignores hidden frames and stalls, and gives up on a hopeless world", () => {
    const g = new QualityGovernor(qualityLadder(2));
    for (let i = 0; i < 200; i++) expect(g.sample(400, true)).toBe("keep"); // stalls
    for (let i = 0; i < 200; i++) expect(g.sample(60, false)).toBe("keep"); // hidden
    expect(frames(g, 200, 4)).toContain("hopeless");
  });
});
