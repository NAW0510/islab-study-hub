import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHIP_TONE_WEIGHT, contrast, DOMAIN_TOKENS, mix, parseTokens, type Scheme, type TokenMap } from "./contrast";

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

/** The block that holds the design tokens (see the top of globals.css). */
const TOKEN_SELECTOR = ":root, .theme-scope";
const tokens = parseTokens(css, TOKEN_SELECTOR);

const SCHEMES: Scheme[] = ["light", "dark"];
const AA_TEXT = 4.5;
const AA_MARK = 3;

/** Foreground/background pairs that carry normal-size text. */
const TEXT_PAIRS: [string, string][] = [
  ["--text", "--bg"],
  ["--text", "--surface"],
  ["--text", "--surface-2"],
  ["--text-2", "--bg"],
  ["--text-2", "--surface"],
  ["--text-2", "--surface-2"],
  ["--text", "--mark-blue-soft"],
  ["--text", "--mark-yellow-soft"],
  ["--text", "--mark-red-soft"],
  ["--text", "--mark-green-soft"],
  ["--muted", "--bg"],
  ["--muted", "--surface"],
  ["--muted", "--surface-2"],
  ["--accent", "--bg"],
  ["--accent", "--surface"],
  ["--accent", "--accent-soft"],
  ["--text", "--accent-soft"],
  ["--accent-fg", "--accent"],
  ["--primary-fg", "--primary"],
  ["--primary-fg", "--primary-hover"],
  ["--danger", "--bg"],
  ["--danger", "--surface"],
  ["--danger", "--danger-soft"],
  ["--danger-fg", "--danger"],
  ["--success", "--bg"],
  ["--success", "--surface"],
];

function pick(map: TokenMap, name: string, scheme: Scheme) {
  const token = map[name];
  if (!token) throw new Error(`Token ${name} tidak ada di ${TOKEN_SELECTOR}`);
  return token[scheme];
}

describe("parseTokens", () => {
  it("reads hex, light-dark() and var() values and skips the rest", () => {
    const sample = `
.x {
  --a: #FFFFFF; /* comment */
  --b: light-dark(#000000, #ffffff);
  --c: var(--b);
  --r: 0.5rem;
}`;
    expect(parseTokens(sample, ".x")).toEqual({
      "--a": { light: "#ffffff", dark: "#ffffff" },
      "--b": { light: "#000000", dark: "#ffffff" },
      "--c": { light: "#000000", dark: "#ffffff" },
    });
  });

  it("throws when the block is missing", () => {
    expect(() => parseTokens(".x { --a: #000000; }", ".y")).toThrow();
  });
});

describe("contrast helpers", () => {
  it("match the WCAG reference values", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
});

describe.each(SCHEMES)("design tokens, %s mode", (scheme) => {
  it.each(TEXT_PAIRS)("%s on %s meets AA for text", (fg, bg) => {
    expect(contrast(pick(tokens, fg, scheme), pick(tokens, bg, scheme))).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("keeps ink readable on every tinted chip", () => {
    const tones = [...DOMAIN_TOKENS, "--domain-none", "--signal-good", "--signal-warn", "--signal-bad", "--accent"];
    for (const tone of tones) {
      const background = mix(pick(tokens, tone, scheme), pick(tokens, "--surface", scheme), CHIP_TONE_WEIGHT);
      expect(contrast(pick(tokens, "--text", scheme), background), tone).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it("keeps categorical marks visible on the surface", () => {
    // Light mode has three bright hues (toska, kuning, merah muda) below 3:1 by
    // design; they are only ever used next to a text label. They must still
    // clear 2:1 so a dot or bar never disappears.
    const floor = scheme === "dark" ? AA_MARK : 2;
    for (const name of DOMAIN_TOKENS) {
      expect(contrast(pick(tokens, name, scheme), pick(tokens, "--surface", scheme)), name).toBeGreaterThanOrEqual(floor);
    }
    expect(contrast(pick(tokens, "--domain-none", scheme), pick(tokens, "--surface", scheme))).toBeGreaterThanOrEqual(AA_MARK);
  });

  it("keeps the primaries visible as marks", () => {
    for (const name of ["--mark-blue", "--mark-red", "--mark-green"]) {
      expect(contrast(pick(tokens, name, scheme), pick(tokens, "--surface", scheme)), name).toBeGreaterThanOrEqual(AA_MARK);
    }
    // Yellow is light paint: on light paper it is decoration only and always
    // carries an ink shape (below); at night it must stand out.
    const yellowFloor = scheme === "dark" ? AA_MARK : 1.5;
    expect(contrast(pick(tokens, "--mark-yellow", scheme), pick(tokens, "--surface", scheme))).toBeGreaterThanOrEqual(yellowFloor);
  });

  it("keeps a shape on a coloured tile visible", () => {
    for (const tile of ["--mark-blue", "--mark-red", "--mark-green"]) {
      expect(contrast(pick(tokens, "--paper", scheme), pick(tokens, tile, scheme)), tile).toBeGreaterThanOrEqual(AA_MARK);
    }
    expect(contrast(pick(tokens, "--paper-ink", scheme), pick(tokens, "--mark-yellow", scheme))).toBeGreaterThanOrEqual(AA_MARK);
  });

  it("keeps the tick on a finished topic visible", () => {
    expect(contrast(pick(tokens, "--on-signal", scheme), pick(tokens, "--signal-good", scheme))).toBeGreaterThanOrEqual(AA_MARK);
  });
});
