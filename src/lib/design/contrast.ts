/**
 * Reads design tokens out of globals.css and measures colour contrast (WCAG 2).
 * Used by the contrast test and by the dev preview at /dev/design, so the
 * stylesheet stays the single source of truth for token values.
 */

export type Scheme = "light" | "dark";
export type Token = Record<Scheme, string>;
export type TokenMap = Record<string, Token>;

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Colour tokens declared in the first `selector { … }` block of `css`.
 * Understands `#rrggbb`, `light-dark(#rrggbb, #rrggbb)` and `var(--other)`;
 * anything else (radii, fonts, durations) is skipped.
 */
export function parseTokens(css: string, selector: string): TokenMap {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1];
  if (!block) throw new Error(`Tidak menemukan blok "${selector}" di stylesheet.`);

  const raw = new Map<string, string>();
  const declaration = /(--[\w-]+)\s*:\s*([^;]+);/g;
  for (const match of block.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(declaration)) {
    raw.set(match[1], match[2].trim());
  }

  const tokens: TokenMap = {};
  const resolve = (value: string, depth = 0): Token | null => {
    if (HEX.test(value)) return { light: value.toLowerCase(), dark: value.toLowerCase() };
    const pair = /^light-dark\(\s*(#[0-9a-f]{6})\s*,\s*(#[0-9a-f]{6})\s*\)$/i.exec(value);
    if (pair) return { light: pair[1].toLowerCase(), dark: pair[2].toLowerCase() };
    const ref = /^var\((--[\w-]+)\)$/.exec(value);
    const target = ref && raw.get(ref[1]);
    return target && depth < 5 ? resolve(target, depth + 1) : null;
  };
  for (const [name, value] of raw) {
    const token = resolve(value);
    if (token) tokens[name] = token;
  }
  return tokens;
}

function channels(hex: string) {
  if (!HEX.test(hex)) throw new Error(`Bukan warna hex 6 digit: ${hex}`);
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

/** Relative luminance (WCAG 2). */
export function luminance(hex: string) {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio, 1–21. AA needs 4.5 for text and 3 for large text and marks. */
export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `color-mix(in srgb, a <weight>, b)` for opaque colours; `weight` is 0–1. */
export function mix(a: string, b: string, weight: number) {
  const [ca, cb] = [channels(a), channels(b)];
  return "#" + ca.map((c, i) => Math.round(c * weight + cb[i] * (1 - weight)).toString(16).padStart(2, "0")).join("");
}

/** Share of the tone colour in a `.chip-tone` background (see globals.css). */
export const CHIP_TONE_WEIGHT = 0.14;

export const DOMAIN_TOKENS = [
  "--domain-1",
  "--domain-2",
  "--domain-3",
  "--domain-4",
  "--domain-5",
  "--domain-6",
  "--domain-7",
  "--domain-8",
  "--domain-9",
  "--domain-10",
] as const;
