/**
 * Colours for the world, read from the design tokens at run time (so
 * light-dark() and color-mix() are already resolved by the browser) and
 * normalised to "#rrggbb" through a 2D context. The world's own colours
 * (fog, stone, lantern light) are physical parts of the picture, not UI, so
 * they live here as constants per scheme (docs/DESIGN_SYSTEM.md allows that
 * for the 3D views).
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

export type WorldColors = {
  /** Clear colour and the fog folded sheets sink into. */
  fog: [number, number, number];
  /** Stone and wood of the library, near and far. */
  stone: [number, number, number];
  wood: [number, number, number];
  /** Lantern and window light. */
  light: [number, number, number];
  /** How strongly the light glows (bloom-ish additive sprites). */
  glow: number;
};

export const WORLD_COLORS: Record<Scheme, WorldColors> = {
  // Pearl fog, ivory stone and warm white light by day.
  light: { fog: [0.93, 0.925, 0.905], stone: [0.86, 0.84, 0.8], wood: [0.7, 0.62, 0.52], light: [1, 0.93, 0.78], glow: 0.55 },
  // Ink-blue fog, dark stacks and lamp-gold light by night.
  dark: { fog: [0.05, 0.065, 0.11], stone: [0.17, 0.2, 0.28], wood: [0.24, 0.19, 0.16], light: [1, 0.72, 0.38], glow: 0.8 },
};

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
