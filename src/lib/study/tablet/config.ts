/**
 * The Istilah Teknis book: the sheet lifts off the shelf, lays itself down,
 * turns into a tablet, and projects the Peta Otak (2D or 3D) as a hologram.
 * Every number in one place (spec §0). World units are arbitrary; times are
 * seconds unless named _MS.
 */
export const TABLET_CONFIG = {
  book: {
    /** Depth of the closed book (its cover's short side), world units. */
    HEIGHT: 2.1,
    THICKNESS: 0.26,
    COVER: 0.035,
    /** Cover proportions when the sheet's own size is unknown (a direct visit). */
    ASPECT: 1.9,
    /** Where the tablet rests, under the hologram, and its size there. */
    REST: [0, -0.45, 1.05] as const,
    REST_SCALE: 0.88,
    /** What is left of the page block once it is a tablet (share of its thickness). */
    TABLET_BLOCK: 0.12,
  },
  /** The flat Peta Otak: its [-1, 1] square, standing above the tablet. */
  map2d: {
    SIZE: 3.5,
    CENTER: [0, 2.0, -0.75] as const,
    TILT: -0.16,
    /** Point size at the map (world units), and the selected one's. */
    POINT: 0.06,
    POINT_FOCUS: 0.11,
    /** Samples along each smoothed region outline. */
    OUTLINE_SAMPLES: 72,
    /** How close (map units) the pointer must come to a point to pick it. */
    PICK: 0.06,
  },
  /** The brain (the Otak view's neurons), above the tablet. */
  brain: {
    /** The brain is about 2 units long; this many world units per brain unit. */
    SCALE: 1.85,
    CENTER: [0, 2.05, -0.55] as const,
    /** Slow turn while idle (radians per second); still while a term is in focus. */
    SPIN: 0.1,
    POINT: 0.07,
    SCAFFOLD_POINT: 0.028,
    /** Picking threshold (world units). */
    PICK: 0.08,
  },
  camera: {
    FOV: 34,
    /** Looking down at the book as it arrives and turns into a tablet. */
    BOOK: { position: [0, 4.4, 7.6] as const, target: [0, -0.2, 0.6] as const },
    /** The whole hologram above the tablet. */
    OVERVIEW: { position: [0, 2.25, 10.4] as const, target: [0, 1.3, -0.4] as const },
    LEAN: 0.3,
    /** How far from a focused term the camera stops. */
    FOCUS_DISTANCE: 3.1,
    FOCUS_TIME: 1.2,
  },
  /** The opening, in seconds from the click. Any input jumps to its end. */
  open: {
    LIFT: 0.8,
    COVER: 0.5,
    MORPH_AT: 0.6,
    MORPH_TIME: 0.9,
    SCREEN_AT: 1.25,
    SCREEN_TIME: 0.55,
    BEAM_AT: 1.4,
    BEAM_TIME: 0.7,
    CONTENT_AT: 1.6,
    CONTENT_TIME: 1.2,
    CAMERA_AT: 1.1,
    CAMERA_TIME: 2.0,
    LABELS_AT: 2.3,
    END: 3.3,
    /** Coming back from a field's room or a page: start here, already a tablet. */
    RESUME_AT: 1.5,
    /** …and the fog closes this fast. */
    RESUME_COVER: 0.35,
  },
  /** Back onto the shelf. */
  close: {
    CONTENT_TIME: 0.4,
    SCREEN_AT: 0.15,
    SCREEN_TIME: 0.35,
    MORPH_AT: 0.3,
    MORPH_TIME: 0.5,
    FLY_AT: 0.6,
    FLY_TIME: 0.7,
    CLEAR_AT: 0.85,
    END: 1.35,
    /** Into a field's room or a term's page: the hologram rushes past and the fog clears. */
    DIVE: 0.65,
  },
  /** 2D ↔ 3D. */
  switchTime: 0.9,
  holo: {
    FILL: 0.1,
    FILL_HIGHLIGHT: 0.3,
    LINE_WIDTH: 1.4,
    LINE_WIDTH_FOCUS: 2.6,
    FLICKER: 0.04,
    /** Others while one field or term stands out. */
    DIM: 0.3,
    LIGHT_ALPHA: 1.2,
    BEAM: 0.18,
    DUST: 200,
    /** Field names: canvas text height (px) and world height. */
    LABEL_PX: 56,
    LABEL_HEIGHT: 0.16,
  },
  ui: {
    PANEL: 400,
    LEFT: 240,
    WIDE: 960,
  },
} as const;
