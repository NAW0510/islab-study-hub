import { mulberry32 } from "../layout/prng";

/**
 * The cover of a term in the Perpustakaan: a grid of Bauhaus shapes in its
 * field's colour on paper, the same for a term every time (seeded by its id).
 * The DOM draws it as SVG (cover-art.tsx) and the WebGL world draws the very
 * same tiles into a canvas texture (`new Path2D(TILE_PATHS[kind])`), so both
 * modes show one picture.
 */

export const COVER_COLS = 10;
export const COVER_ROWS = 4;

/** Shapes in a 100×100 box. Filled with the even-odd rule (ring and frame have a hole). */
export const TILE_PATHS = {
  circle: "M50 6A44 44 0 1 1 49.99 6Z",
  ring: "M50 6A44 44 0 1 1 49.99 6ZM50 30A20 20 0 1 0 50.01 30Z",
  square: "M8 8H92V92H8Z",
  frame: "M8 8H92V92H8ZM30 30V70H70V30Z",
  triangle: "M6 94H94V6Z",
  plus: "M38 6H62V38H94V62H62V94H38V62H6V38H38Z",
  cross: "M20 4L50 34L80 4L96 20L66 50L96 80L80 96L50 66L20 96L4 80L34 50L4 20Z",
  half: "M4 52A46 46 0 0 1 96 52Z",
  quarter: "M6 94V6A88 88 0 0 1 94 94Z",
  star: "M50 4C54 38 62 46 96 50C62 54 54 62 50 96C46 62 38 54 4 50C38 46 46 38 50 4Z",
  leaf: "M8 92C8 40 40 8 92 8C92 60 60 92 8 92Z",
} as const;

export type TileKind = keyof typeof TILE_PATHS;
export const TILE_KINDS = Object.keys(TILE_PATHS) as TileKind[];

/** "main" is the field colour, "deep" the same colour darkened toward ink. */
export type TileInk = "main" | "deep";

export type CoverTile = { col: number; row: number; kind: TileKind; ink: TileInk; rotation: 0 | 90 | 180 | 270 };

/** Share of cells left as bare paper, and of shapes drawn in the deep tone. */
const EMPTY_SHARE = 0.18;
const DEEP_SHARE = 0.3;

/** A 32-bit seed from any string (FNV-1a). */
export function seedOf(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * The tiles of one cover. Each term favours three of the shapes (so covers
 * differ in character, not only in arrangement) and mixes in the rest now
 * and then.
 */
export function coverPattern(seed: string, cols = COVER_COLS, rows = COVER_ROWS): CoverTile[] {
  const random = mulberry32(seedOf(seed));
  // Fisher–Yates, not sort() with a random comparator: that depends on the engine's sort
  // and would give the server and the browser different covers.
  const kinds = [...TILE_KINDS];
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  const favourites = kinds.slice(0, 3);
  const tiles: CoverTile[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (random() < EMPTY_SHARE) continue;
      const kind = random() < 0.8 ? favourites[Math.floor(random() * favourites.length)] : TILE_KINDS[Math.floor(random() * TILE_KINDS.length)];
      const ink: TileInk = random() < DEEP_SHARE ? "deep" : "main";
      const rotation = ([0, 90, 180, 270] as const)[Math.floor(random() * 4)];
      tiles.push({ col, row, kind, ink, rotation });
    }
  }
  return tiles;
}
