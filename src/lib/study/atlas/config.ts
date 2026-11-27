/**
 * The Bahasa book's atlas: every number in one place (spec §0). World units
 * are arbitrary; times are seconds unless named _MS.
 */
export const ATLAS_CONFIG = {
  /** The hologram map: equirectangular, cropped to where people live. */
  map: {
    /** Width of the whole map in world units. */
    WIDTH: 7.4,
    LAT_TOP: 84,
    LAT_BOTTOM: -57,
    /** Its centre, above and behind the open book. */
    CENTER: [0, 2.05, -0.75] as const,
    /** Leans back (radians) so it faces the camera above the book. */
    TILT: -0.2,
    /** Gentle float while idle: amplitude (units) and period (s). */
    FLOAT: 0.035,
    FLOAT_PERIOD: 7,
    /** Graticule every so many degrees. */
    GRATICULE: 15,
  },
  /** The book: the Bahasa sheet's cover, then a landscape atlas. */
  book: {
    /** Depth of the closed book (its cover's short side), world units. */
    HEIGHT: 2.1,
    THICKNESS: 0.26,
    COVER: 0.035,
    /** Cover proportions when the sheet's own size is unknown (a direct visit). */
    ASPECT: 1.9,
    /** Where it rests, open, under the map. */
    REST: [0, -0.4, 0.95] as const,
    /** The open spread at rest spans this share of the map's width (the book shrinks as it lands). */
    SPREAD: 0.78,
    /** Loose pages that turn as it opens. */
    FLUTTER_PAGES: 4,
  },
  camera: {
    FOV: 34,
    /** Looking down at the book as it arrives and opens. */
    BOOK: { position: [0, 4.4, 7.6] as const, target: [0, -0.2, 0.6] as const },
    /** The whole map above the open book. */
    OVERVIEW: { position: [0, 2.3, 9.8] as const, target: [0, 1.3, -0.4] as const },
    /** How far it leans toward the pointer (units). */
    LEAN: 0.32,
    /** A focused country fills this share of the view. */
    FOCUS_FILL: 0.5,
    /** Smallest span (degrees) a focus frames, so Singapore is not a wall of pixels. */
    FOCUS_MIN_SPAN: 6,
    /** Closest the camera comes to the map. */
    FOCUS_MIN_DISTANCE: 0.9,
    FOCUS_TIME: 1.35,
    /** Extra pull-back mid-flight between two far countries, per unit travelled. */
    FOCUS_ARC: 0.16,
  },
  /** The opening, in seconds from the click. Any input jumps to its end. */
  open: {
    LIFT: 0.8,
    /** The backdrop covers the library over this long (from 0). */
    COVER: 0.5,
    COVER_AT: 0.55,
    COVER_TIME: 0.95,
    PAGES_AT: 0.75,
    PAGE_STAGGER: 0.11,
    PAGE_TIME: 0.85,
    BEAM_AT: 1.35,
    BEAM_TIME: 0.8,
    MAP_AT: 1.55,
    MAP_TIME: 1.25,
    CAMERA_AT: 1.15,
    CAMERA_TIME: 2.0,
    /** Lit countries come on one after another, west to east. */
    LIGHT_AT: 2.35,
    LIGHT_SPREAD: 0.9,
    END: 3.35,
  },
  /** Back to the shelf. */
  close: {
    MAP_TIME: 0.4,
    COVER_AT: 0.2,
    COVER_TIME: 0.55,
    FLY_AT: 0.55,
    FLY_TIME: 0.7,
    /** The backdrop clears over the flight's second half. */
    CLEAR_AT: 0.85,
    END: 1.3,
  },
  /** The hologram's look. Alphas are for the dark scheme; the light one scales them (LIGHT_ALPHA). */
  holo: {
    FILL: 0.12,
    FILL_LIT: 0.42,
    FILL_HOVER: 0.3,
    LINE: 0.5,
    LINE_LIT: 0.95,
    LINE_WIDTH: 1.1,
    LINE_WIDTH_FOCUS: 2.4,
    SCAN_LINES: 210,
    SCAN_SPEED: 0.08,
    FLICKER: 0.05,
    /** Others while one country is in focus. */
    DIM: 0.3,
    LIGHT_ALPHA: 1.25,
    BEAM: 0.2,
    DUST: 260,
  },
  /** Pointer and panel. */
  ui: {
    /** The right-hand panel's width on wide screens (px); the view shifts left by half of it. */
    PANEL: 400,
    /** The head and the legend on the left (px), on wide screens. */
    LEFT: 240,
    WIDE: 960,
  },
} as const;
