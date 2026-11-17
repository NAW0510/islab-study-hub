/**
 * Every tuning number of the Perpustakaan world, with the reason for it.
 * The behaviour follows the Articles page of labmgm.org (itself after
 * unseen.co); the numbers marked "MGM" are the ones that page documents.
 */
export const LIBRARY_CONFIG = {
  camera: {
    /** CSS px between the camera and the card plane: with the matching fov, 1 world unit = 1 CSS px there (MGM). */
    DISTANCE: 2000,
    /** Largest tilt toward the mouse, degrees (MGM: pitch 2.0°, yaw 2.9°). */
    PITCH: 2.0,
    YAW: 2.9,
    /** Seconds the camera takes to follow the mouse (about 63% of the way). */
    FOLLOW: 0.6,
    /** A slow wander so the scene never freezes: amplitude (degrees) and period (seconds). */
    WANDER: 0.35,
    WANDER_PERIOD: 23,
  },
  sheet: {
    /** Slow diagonal wave lifting the river toward the camera: crest in px (MGM: about 24 px), wavelength px, seconds per cycle. */
    SWELL: 24,
    SWELL_WAVELENGTH: 1500,
    SWELL_PERIOD: 9,
    /** The fold starts this share of the viewport under the head's bottom (MGM: 3.5 %). */
    FOLD_GAP: 0.035,
    /** Over this share of the viewport above the fold line a sheet goes all the way back. */
    FOLD_ZONE: 0.42,
    /** How far back a fully folded sheet sits, px (MGM: up to 2400 px). */
    FOLD_DEPTH: 2400,
    /** Twist and wobble of a folding sheet, radians at full fold. */
    FOLD_TWIST: 0.22,
    FOLD_WOBBLE: 0.08,
    /** Segments of a sheet's mesh: enough for the swell and the fold to bend smoothly. */
    SEGMENTS_X: 24,
    SEGMENTS_Y: 14,
    /** Texture pixels per CSS px of a sheet (capped by MAX_TEXTURE). */
    TEXTURE_SCALE: 1.5,
    MAX_TEXTURE: 1400,
    /** Seconds a flip takes. */
    FLIP: 0.75,
  },
  wake: {
    /** A card gets GPU resources within these many viewports of the screen, and gives them back past the second pair (MGM). */
    WAKE_ABOVE: 1,
    WAKE_BELOW: 2.1,
    SLEEP_ABOVE: 1.8,
    SLEEP_BELOW: 3.1,
    /** Most cards awake at once; the farthest sleep first (MGM). */
    MAX_AWAKE: 28,
  },
  lens: {
    /**
     * Barrel distortion at the corners, and the spectral split there in px at a 1440 px wide screen. MGM uses about
     * 17 px; ours is lower and falls off faster toward the centre, because these sheets carry text people read.
     */
    BARREL: 0.055,
    SPLIT: 10,
    /** A first visit starts this many times more warped and settles over SETTLE seconds. */
    INTRO_WARP: 5,
    SETTLE: 1.8,
    /** Grain strength and vignette depth (0–1). */
    GRAIN: 0.06,
    VIGNETTE: 0.28,
    /** Longest vertical smear for a fast scroll, px, and the scroll speed (px/s) that reaches it. */
    BLUR_MAX: 90,
    BLUR_SPEED: 4000,
  },
  quality: {
    /** Seconds of visible time skipped after a start or a change (shader warm-up, uploads). */
    WARMUP: 1,
    /** Frames are judged over this many seconds of steady visible time. */
    WINDOW: 2,
    /** Average frame time that counts as missing, ms (about 45 fps). */
    MISS_MS: 22,
    /** Below this many fps after warming up, the visit goes back to the DOM page. */
    HOPELESS_FPS: 8,
    /** A frame longer than this is a stall (tab switch, debugger), not a slow GPU, ms. */
    STALL_MS: 250,
    /** Pixel ratios to step through before thinning the scene. */
    PIXEL_RATIOS: [2, 1.5, 1.25, 1],
  },
  cursor: {
    /** Seconds the ring lags behind the pointer, and its largest stretch (MGM: at most 55 %). */
    LAG: 0.12,
    STRETCH: 0.55,
    /** Resting this long releases a swarm of paper, ms (MGM: about 400 ms). */
    REST_MS: 400,
  },
} as const;
