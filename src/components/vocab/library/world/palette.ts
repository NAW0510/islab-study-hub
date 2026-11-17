/**
 * Colours for the world. UI colours (the sheets' text, paper and field
 * colours) are read from the design tokens at run time, so light-dark() and
 * color-mix() are already resolved, and normalised to "#rrggbb" through a 2D
 * context. The library's own colours are parts of the picture, not UI, so
 * they live here as constants per scheme.
 */
export type Scheme = "light" | "dark";

export type UiColors = {
  paper: string;
  paperInk: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  primary: string;
  primaryFg: string;
  accent: string;
};

export type Rgb = [number, number, number];

type SchemePalette = {
  /** The fog, and the page behind everything. */
  fog: Rgb;
  /** Stone: piers, galleries, arches, walls. */
  stone: Rgb;
  /** Wood of the cases and shelves. */
  wood: Rgb;
  floor: Rgb;
  /** Book bindings, picked per book. Pale by day (a heavenly archive), dark by night. */
  books: readonly Rgb[];
  /** The river of light down the floor. */
  river: Rgb;
  /** The great window's glass, and its leading. */
  glass: Rgb;
  lead: Rgb;
  /** Light laid over the fog: the window's halo and rays, the lantern flames. */
  halo: Rgb;
  ray: Rgb;
  flame: Rgb;
  /** Dust in the air. */
  mote: Rgb;
  /** The pools of light the lanterns throw on the stacks. */
  lantern: Rgb;
  /** The window's light scattered in the fog. */
  scatter: Rgb;
};

/**
 * The library's own colours, for both schemes: raw display sRGB (0–1), shown
 * exactly as written. Day: pearl fog, ivory stone, pale bindings, warm white
 * light. Night: near-black fog, ink-blue stacks, moonlit glass, ember lamps.
 * These are parts of a picture, not UI, so they live here and not in the
 * design tokens (docs/DESIGN_SYSTEM.md, pola Perpustakaan).
 */
export const LIBRARY_PALETTE: { light: SchemePalette; dark: SchemePalette } = {
  light: {
    fog: [0.925, 0.935, 0.952],
    stone: [0.953, 0.94, 0.918],
    wood: [0.89, 0.86, 0.81],
    floor: [0.94, 0.925, 0.9],
    books: [
      [0.96, 0.94, 0.9],
      [0.91, 0.87, 0.79],
      [0.86, 0.82, 0.75],
      [0.98, 0.97, 0.95],
      [0.9, 0.83, 0.69],
      [0.84, 0.87, 0.91],
      [0.93, 0.89, 0.85],
      [0.8, 0.77, 0.7],
      [0.91, 0.85, 0.81],
      [0.86, 0.89, 0.85],
    ],
    river: [1, 0.99, 0.95],
    glass: [1, 0.975, 0.89],
    lead: [0.8, 0.78, 0.74],
    halo: [0.42, 0.4, 0.34],
    ray: [0.36, 0.34, 0.29],
    flame: [1, 0.82, 0.52],
    mote: [1, 1, 1],
    lantern: [0.55, 0.45, 0.3],
    scatter: [0.04, 0.035, 0.015],
  },
  dark: {
    fog: [0.02, 0.024, 0.04],
    stone: [0.05, 0.056, 0.08],
    wood: [0.065, 0.055, 0.05],
    floor: [0.045, 0.05, 0.07],
    books: [
      [0.065, 0.075, 0.11],
      [0.085, 0.1, 0.15],
      [0.045, 0.05, 0.075],
      [0.1, 0.12, 0.18],
      [0.14, 0.11, 0.07],
      [0.07, 0.125, 0.24],
      [0.06, 0.07, 0.1],
      [0.11, 0.1, 0.125],
      [0.165, 0.08, 0.095],
      [0.06, 0.125, 0.11],
    ],
    river: [0.16, 0.3, 0.56],
    glass: [0.12, 0.23, 0.52],
    lead: [0.3, 0.3, 0.32],
    halo: [0.16, 0.28, 0.6],
    ray: [0.2, 0.38, 0.72],
    flame: [1, 0.52, 0.16],
    mote: [0.6, 0.72, 0.95],
    lantern: [1, 0.55, 0.17],
    scatter: [0.05, 0.085, 0.19],
  },
};

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** The fog colour as the library shaders compute it (fogColour in library-shaders.ts), for the cards and the background. */
export function fogOf(dark: number, theme: number, themeColor: Rgb): Rgb {
  const fog = mixRgb(LIBRARY_PALETTE.light.fog, LIBRARY_PALETTE.dark.fog, dark);
  if (theme <= 0) return fog;
  const night = mixRgb(fog, [themeColor[0] * 0.22, themeColor[1] * 0.22, themeColor[2] * 0.22], 0.5);
  const themed = mixRgb(mixRgb(fog, themeColor, 0.09), night, dark);
  return mixRgb(fog, themed, theme);
}

let normaliser: CanvasRenderingContext2D | null = null;

/** Any CSS colour → "#rrggbb" (or rgba() when translucent). */
export function normalise(css: string): string {
  normaliser ??= document.createElement("canvas").getContext("2d");
  if (!normaliser) return css;
  normaliser.fillStyle = "#000000";
  normaliser.fillStyle = css;
  return normaliser.fillStyle;
}

/** Reads CSS colour expressions (token vars, color-mix) in the context of `host`. */
export function colorReader(host: HTMLElement) {
  const probe = document.createElement("span");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
  host.appendChild(probe);
  const cache = new Map<string, string>();
  return {
    read(expression: string): string {
      let value = cache.get(expression);
      if (value === undefined) {
        probe.style.color = "";
        probe.style.color = expression;
        value = normalise(getComputedStyle(probe).color);
        cache.set(expression, value);
      }
      return value;
    },
    /** Forget cached values (the scheme changed). */
    reset() {
      cache.clear();
    },
    dispose() {
      probe.remove();
    },
  };
}

export type ColorReader = ReturnType<typeof colorReader>;

export function uiColors(reader: ColorReader): UiColors {
  return {
    paper: reader.read("var(--paper)"),
    paperInk: reader.read("var(--paper-ink)"),
    surface: reader.read("var(--surface)"),
    text: reader.read("var(--text)"),
    muted: reader.read("var(--muted)"),
    border: reader.read("var(--border)"),
    primary: reader.read("var(--primary)"),
    primaryFg: reader.read("var(--primary-fg)"),
    accent: reader.read("var(--accent)"),
  };
}

/** The field colour of a card and its deep tone, as the DOM cover mixes them. */
export function coverColors(reader: ColorReader, colorKey: string): { main: string; deep: string } {
  const main = `var(--${colorKey})`;
  return { main: reader.read(main), deep: reader.read(`color-mix(in srgb, ${main} 58%, var(--paper-ink))`) };
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex);
  if (!m) return [0, 0, 0];
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}
