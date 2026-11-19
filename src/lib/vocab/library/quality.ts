import { LIBRARY_CONFIG } from "./config";

/**
 * Adaptive quality for the Perpustakaan world. It starts at a level from a
 * device guess, then judges steady visible frames and steps down while they
 * miss: first the pixel ratio, then the tier (a thinner library, fewer
 * particles). It never steps back up in a visit: quality that climbs and
 * falls looks worse than quality that holds. A world under HOPELESS_FPS
 * after warming up hands the visit back to the DOM page.
 */
export type Tier = "high" | "medium" | "low";
export type QualityLevel = { pixelRatio: number; tier: Tier };
export type QualityVerdict = "keep" | "lower" | "hopeless";

const TIERS: Tier[] = ["high", "medium", "low"];

/** Every level, best first: each pixel ratio at the high tier, then the lower tiers at pixel ratio 1. */
export function qualityLadder(deviceRatio: number): QualityLevel[] {
  const ratios = LIBRARY_CONFIG.quality.PIXEL_RATIOS.filter((r) => r <= Math.max(1, deviceRatio));
  const unique = [...new Set([Math.min(deviceRatio, ratios[0] ?? 1), ...ratios])].sort((a, b) => b - a);
  return [...unique.map((pixelRatio) => ({ pixelRatio, tier: "high" as Tier })), ...TIERS.slice(1).map((tier) => ({ pixelRatio: 1, tier }))];
}

export class QualityGovernor {
  private readonly ladder: QualityLevel[];
  private index: number;
  private warm = 0;
  private windowTime = 0;
  private windowFrames = 0;
  private locked: boolean;
  private readonly cfg = LIBRARY_CONFIG.quality;

  constructor(ladder: QualityLevel[], startIndex = 0, locked = false) {
    this.ladder = ladder;
    this.index = Math.min(Math.max(0, startIndex), ladder.length - 1);
    this.locked = locked;
  }

  get level(): QualityLevel {
    return this.ladder[this.index];
  }

  /** Feeds one frame (ms, and whether the page was visible). */
  sample(frameMs: number, visible: boolean): QualityVerdict {
    if (!visible || frameMs > this.cfg.STALL_MS) return "keep";
    const seconds = frameMs / 1000;
    if (this.warm < this.cfg.WARMUP) {
      this.warm += seconds;
      return "keep";
    }
    this.windowTime += seconds;
    this.windowFrames += 1;
    if (this.windowTime < this.cfg.WINDOW) return "keep";

    const average = (this.windowTime * 1000) / this.windowFrames;
    this.windowTime = 0;
    this.windowFrames = 0;
    if (average <= this.cfg.MISS_MS) return "keep";
    // Far too slow at any level (a software renderer that hides its name): no ladder will save it.
    if (1000 / average < this.cfg.HOPELESS_FPS) return "hopeless";
    if (this.index === this.ladder.length - 1 || this.locked) return "keep";
    this.index += 1;
    this.warm = 0;
    return "lower";
  }
}
