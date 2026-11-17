import * as THREE from "three";
import { LIBRARY_CONFIG } from "@/lib/vocab/library/config";
import { foldLine } from "@/lib/vocab/library/fold";
import { QualityGovernor, qualityLadder, type QualityLevel } from "@/lib/vocab/library/quality";
import { CardsLayer } from "./cards";
import { CompositePass } from "./composite";
import { colorReader, fogOf, hexToRgb, type ColorReader, type Rgb, type Scheme } from "./palette";

/**
 * The Perpustakaan world: one fixed three.js canvas behind the page, from
 * the left edge of the main column to the right of the viewport.
 *
 * Space: the camera sits CAMERA.DISTANCE CSS px in front of the card plane
 * (z = 0) with a field of view that makes one world unit one CSS px there,
 * so DOM rects map straight onto the plane. The camera leans toward the
 * mouse and wanders a little around a pivot on that plane, so the cards stay
 * nearly anchored under their buttons while the library swings behind them.
 *
 * Each frame: read the scroll, the head and the pointer; ease the scheme
 * (day ↔ night glides), the field theme and any transition; update the
 * layers; render the scene to a target; draw it through the lens.
 *
 * Transitions (shelf ↔ a field's room): the whole scene pans away while a
 * wash of the field's colour sweeps across; under full cover the page swaps
 * its list (`swap`), the room takes the field's colour, and the new sheets
 * slide in as the wash dissolves.
 *
 * The quality governor watches frame times and steps the pixel ratio and the
 * scene down while frames miss, and hands the visit back to the DOM page
 * when nothing helps. Hidden tabs draw nothing (rAF pauses).
 */
export type LibraryWorld = {
  rescan(): void;
  /** Lean the room toward a field's colour (a CSS colour expression), or back to the plain library (null). */
  setTheme(colour: string | null): void;
  /** Plays a shelf ↔ field transition; `swap` runs under full cover. Resolves when it has settled. */
  transition(kind: "open" | "close", colour: string, swap: () => void): Promise<void>;
  /** "detail" on a term's page: no lens, a quieter camera and thicker fog, so its text reads over the library. */
  setRoute(route: "list" | "detail"): void;
  dispose(): void;
};

export type WorldLayer = {
  update(frame: LayerFrame): void;
  setTier?(tier: QualityLevel["tier"]): void;
  setScheme?(scheme: Scheme): void;
  dispose(): void;
};

export type LayerFrame = {
  time: number;
  dt: number;
  scrollY: number;
  scrollSpeed: number;
  viewWidth: number;
  viewHeight: number;
  pixelRatio: number;
  pointer: THREE.Vector2;
  pointerActive: boolean;
  scheme: Scheme;
  /** 0 day … 1 night, gliding. */
  dark: number;
  fog: THREE.Color;
  /** 0 the plain library … 1 a field's room. */
  theme: number;
  themeColor: THREE.Color;
  /** Sideways pan of the scene during a transition, CSS px. */
  pan: number;
  /** 0 a list … 1 a term's page, gliding. */
  detail: number;
};

type Options = {
  page: HTMLElement;
  head: HTMLElement;
  river: HTMLElement;
  onFallback: (reason: string) => void;
  /** Extra layers (the library, particles, the cursor); built after the scene exists. */
  layers?: (scene: THREE.Scene, camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement, reader: () => ColorReader) => WorldLayer[];
};

type Run = {
  kind: "open" | "close";
  colour: THREE.Color;
  start: number;
  swap: () => void;
  swapped: boolean;
  inStart: number;
  resolve: () => void;
};

const { camera: CAMERA, lens: LENS, transition: TRANSITION } = LIBRARY_CONFIG;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t: number) => 1 - (1 - t) ** 3;

export async function createLibraryWorld({ page, head, river, onFallback, layers }: Options): Promise<LibraryWorld> {
  const canvas = document.createElement("canvas");
  canvas.className = "library-canvas";
  canvas.setAttribute("aria-hidden", "true");
  page.prepend(canvas);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
    failIfMajorPerformanceCaveat: true,
  });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // display sRGB end to end: colours show as written
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 10, CAMERA.DISTANCE + 18000);
  const composite = new CompositePass();
  const reader = colorReader(page);

  const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
  let scheme: Scheme = darkQuery.matches ? "dark" : "light";
  let dark = scheme === "dark" ? 1 : 0;
  let theme = 0;
  let themeTarget = 0;
  let detail = 0;
  let detailTarget = 0;
  const themeColor = new THREE.Color(0.5, 0.5, 0.5);
  const themeColorTarget = themeColor.clone();
  const fog = new THREE.Color(...fogOf(dark, 0, [0.5, 0.5, 0.5]));
  scene.background = fog;

  const fonts = () => {
    const title = river.querySelector(".library-title");
    const meta = river.querySelector(".library-meta");
    return {
      display: title ? getComputedStyle(title).fontFamily : "sans-serif",
      body: meta ? getComputedStyle(meta).fontFamily : "sans-serif",
    };
  };
  const cards = new CardsLayer(scene, river, reader, fonts);
  cards.setScheme(scheme);
  const extra = layers?.(scene, camera, canvas, () => reader) ?? [];
  for (const layer of extra) layer.setScheme?.(scheme);

  const ladder = qualityLadder(window.devicePixelRatio || 1);
  const params = new URLSearchParams(window.location.search);
  const forcedTier = params.get("worldtier");
  const startIndex = forcedTier ? Math.max(0, ladder.findIndex((l) => l.tier === forcedTier)) : 0;
  const governor = new QualityGovernor(ladder, startIndex, Boolean(forcedTier));

  // Size and place: the canvas covers the main column (the sidebar may fold and unfold).
  let viewWidth = 1;
  let viewHeight = 1;
  let canvasLeft = 0;
  const applyLevel = (level: QualityLevel) => {
    renderer.setPixelRatio(level.pixelRatio);
    renderer.setSize(viewWidth, viewHeight, false);
    composite.setSize(viewWidth, viewHeight, level.pixelRatio);
    for (const layer of extra) layer.setTier?.(level.tier);
  };
  const main = page.closest("main");
  const resize = () => {
    canvasLeft = Math.max(0, Math.round(main?.getBoundingClientRect().left ?? 0));
    viewWidth = Math.max(1, window.innerWidth - canvasLeft);
    viewHeight = Math.max(1, window.innerHeight);
    canvas.style.left = `${canvasLeft}px`;
    canvas.style.width = `${viewWidth}px`;
    canvas.style.height = `${viewHeight}px`;
    camera.aspect = viewWidth / viewHeight;
    camera.fov = (2 * Math.atan(viewHeight / 2 / CAMERA.DISTANCE) * 180) / Math.PI;
    camera.updateProjectionMatrix();
    applyLevel(governor.level);
    cards.measure(canvasLeft);
  };
  resize();
  cards.scan();

  // Inputs.
  let clock = 0;
  const pointer = new THREE.Vector2();
  let pointerActive = false;
  const onPointer = (e: PointerEvent) => {
    pointer.set(((e.clientX - canvasLeft) / viewWidth) * 2 - 1, -((e.clientY / viewHeight) * 2 - 1));
    pointerActive = e.pointerType === "mouse";
  };
  let pulseStart = -10;
  const pulseAt = new THREE.Vector2(0.5, 0.5);
  const onDown = (e: PointerEvent) => {
    pulseAt.set((e.clientX - canvasLeft) / viewWidth, 1 - e.clientY / viewHeight);
    pulseStart = clock;
  };
  const onScheme = () => {
    scheme = darkQuery.matches ? "dark" : "light";
    reader.reset();
    cards.setScheme(scheme);
    for (const layer of extra) layer.setScheme?.(scheme);
  };
  const remeasure = () => cards.measure(canvasLeft);
  window.addEventListener("pointermove", onPointer, { passive: true });
  window.addEventListener("pointerdown", onDown, { passive: true });
  window.addEventListener("resize", resize);
  darkQuery.addEventListener("change", onScheme);
  const resizeObserver = new ResizeObserver(remeasure);
  resizeObserver.observe(river);
  const mainObserver = new ResizeObserver(resize);
  if (main) mainObserver.observe(main);
  const mutationObserver = new MutationObserver(() => cards.scan());
  mutationObserver.observe(river, { childList: true });
  void document.fonts?.ready.then(() => {
    remeasure();
    cards.setScheme(`${scheme}:fonts`);
  });
  let lost = false;
  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
    onFallback("context-lost");
  };
  canvas.addEventListener("webglcontextlost", onLost);

  // Warm the programs before the first frame so it doesn't hitch.
  try {
    await renderer.compileAsync(scene, camera);
  } catch {
    // Older drivers: compile on first use.
  }

  // Transitions.
  let run: Run | null = null;
  const readColour = (expression: string) => {
    const [r, g, b] = hexToRgb(reader.read(expression));
    return new THREE.Color(r, g, b);
  };
  const transition = (kind: "open" | "close", colour: string, swap: () => void) =>
    new Promise<void>((resolve) => {
      if (run && !run.swapped) run.swap(); // a newer one supersedes it: land the older swap first
      run?.resolve();
      run = { kind, colour: readColour(colour), start: clock, swap, swapped: false, inStart: 0, resolve };
    });
  const setRoute = (route: "list" | "detail") => {
    detailTarget = route === "detail" ? 1 : 0;
  };
  const setTheme = (colour: string | null) => {
    themeTarget = colour ? 1 : 0;
    if (!colour) return;
    const c = readColour(colour);
    if (theme < 0.02) themeColor.copy(c);
    themeColorTarget.copy(c);
  };

  // Frame loop.
  let last = performance.now();
  let lastScroll = window.scrollY;
  let scrollSpeed = 0;
  let yaw = 0;
  let pitch = 0;
  let frameId = 0;
  let lastMs = 16;
  let intro = 1;
  try {
    intro = sessionStorage.getItem("library-visited") ? 0 : 1;
    sessionStorage.setItem("library-visited", "1");
  } catch {
    // Private mode: every visit gets the settle.
  }

  const frame = (now: number) => {
    frameId = requestAnimationFrame(frame);
    if (lost) return;
    const dtMs = Math.min(100, now - last);
    last = now;
    lastMs = dtMs;
    const dt = dtMs / 1000;
    clock += dt;

    const verdict = governor.sample(dtMs, document.visibilityState === "visible");
    if (verdict === "lower") applyLevel(governor.level);
    if (verdict === "hopeless") {
      onFallback("too-slow");
      return;
    }

    // Scroll speed, signed. A jump (End, a restore) moves the sheets without feeding the smear.
    const scrollY = window.scrollY;
    const moved = scrollY - lastScroll;
    lastScroll = scrollY;
    const perSecond = Math.abs(moved) > viewHeight ? 0 : moved / Math.max(dt, 1 / 240);
    scrollSpeed += (perSecond - scrollSpeed) * (1 - Math.exp(-dt * 10));

    // Camera: lean toward the mouse, wander slowly.
    const follow = 1 - Math.exp(-dt / CAMERA.FOLLOW);
    const wander = Math.sin((clock / CAMERA.WANDER_PERIOD) * Math.PI * 2);
    detail += (detailTarget - detail) * (1 - Math.exp(-dt / 0.5));
    const calm = 1 - 0.65 * detail; // a term's page keeps the camera quieter
    yaw += ((pointerActive ? pointer.x * CAMERA.YAW * calm : 0) + wander * CAMERA.WANDER - yaw) * follow;
    pitch += ((pointerActive ? pointer.y * CAMERA.PITCH * calm : 0) + Math.cos((clock / CAMERA.WANDER_PERIOD) * Math.PI * 1.3) * CAMERA.WANDER * 0.6 - pitch) * follow;
    const ry = (yaw * Math.PI) / 180;
    const rx = (pitch * Math.PI) / 180;
    camera.position.set(Math.sin(ry) * Math.cos(rx), Math.sin(rx), Math.cos(ry) * Math.cos(rx)).multiplyScalar(CAMERA.DISTANCE);
    camera.lookAt(0, 0, 0);

    // Scheme and theme glide.
    dark += ((scheme === "dark" ? 1 : 0) - dark) * (1 - Math.exp(-dt / 0.6));
    theme += (themeTarget - theme) * (1 - Math.exp(-dt / 0.45));
    themeColor.lerp(themeColorTarget, 1 - Math.exp(-dt / 0.35));

    // Transition: pan and wash out, swap under cover, slide in as the wash dissolves.
    let pan = 0;
    const wipe = composite.material.uniforms.uWipe.value as THREE.Vector4;
    wipe.z = 0;
    let busy = false;
    if (run) {
      busy = true;
      const dir = run.kind === "open" ? 1 : -1;
      // The wash is the field's colour softened toward the fog: a tint of the room to come, not a flat poster colour.
      composite.material.uniforms.uWipeColor.value.copy(run.colour).lerp(fog, 0.55 - 0.15 * dark).multiplyScalar(1 - 0.45 * dark);
      if (!run.swapped) {
        const k = easeInOut(Math.min(1, (clock - run.start) / TRANSITION.OUT));
        pan = -dir * k * TRANSITION.PAN * viewWidth;
        wipe.set(k, 0.4, 1, dir);
        if (clock - run.start >= TRANSITION.OUT) {
          run.swapped = true;
          run.inStart = clock + TRANSITION.HOLD;
          run.swap();
        }
      } else {
        const ti = Math.max(0, clock - run.inStart) / TRANSITION.IN;
        const k = easeOut(Math.min(1, ti));
        pan = dir * (1 - k) * TRANSITION.ENTER * viewWidth;
        wipe.set(1, 0.4, 1 - k, dir);
        if (ti >= 1) {
          run.resolve();
          run = null;
        }
      }
    }

    const fogRgb: Rgb = fogOf(dark, theme, [themeColor.r, themeColor.g, themeColor.b]);
    fog.setRGB(...fogRgb);

    const headBottom = head.getBoundingClientRect().bottom;
    cards.update({
      time: clock,
      dt,
      scrollY,
      scrollSpeed: Math.abs(scrollSpeed),
      viewWidth,
      viewHeight,
      canvasLeft,
      foldLine: foldLine(headBottom, viewHeight),
      fog,
      fogDepth: 2600,
      pan,
      texturesPerFrame: busy ? 6 : 2,
    });
    const layerFrame: LayerFrame = {
      time: clock,
      dt,
      scrollY,
      scrollSpeed,
      viewWidth,
      viewHeight,
      pixelRatio: renderer.getPixelRatio(),
      pointer,
      pointerActive,
      scheme,
      dark,
      fog,
      theme,
      themeColor,
      pan,
      detail,
    };
    for (const layer of extra) layer.update(layerFrame);

    // Lens: settles from a stronger warp on a first visit; the smear follows the scroll.
    // A term's page keeps the grain only.
    const settle = intro * Math.max(0, 1 - clock / LENS.SETTLE);
    const lens = 1 - detail;
    const u = composite.material.uniforms;
    u.uBarrel.value = LENS.BARREL * (1 + (LENS.INTRO_WARP - 1) * settle * settle) * lens;
    u.uDispersion.value = (LENS.SPLIT / 1440 / 0.33) * (1 + 2 * settle) * lens;
    u.uBlur.value = busy ? 0 : Math.max(-LENS.BLUR_MAX, Math.min(LENS.BLUR_MAX, scrollSpeed * LENS.BLUR_PER_SPEED)) * lens;
    u.uGrain.value = LENS.GRAIN * (0.7 + 0.3 * dark);
    u.uVignette.value = LENS.VIGNETTE * (0.5 + 0.5 * dark);
    u.uTime.value = clock;
    const pulseAge = clock - pulseStart;
    u.uPulse.value.set(pulseAt.x, pulseAt.y, Math.min(1, pulseAge / 1.1), pulseAge < 1.1 ? 1 : 0);

    renderer.setRenderTarget(composite.target);
    renderer.render(scene, camera);
    composite.render(renderer);
  };
  frameId = requestAnimationFrame(frame);

  // Dev and verification probe.
  const probe = {
    stats: () => ({ mode: "gl", fps: Math.round(1000 / Math.max(1, lastMs)), level: governor.level, scheme, theme: Number(theme.toFixed(2)), detail: Number(detail.toFixed(2)), transition: run ? run.kind : null, ...cards.stats }),
  };
  (window as unknown as { __libraryWorld?: typeof probe }).__libraryWorld = probe;

  return {
    rescan: () => cards.scan(),
    setTheme,
    transition,
    setRoute,
    dispose() {
      cancelAnimationFrame(frameId);
      run?.resolve();
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", resize);
      darkQuery.removeEventListener("change", onScheme);
      resizeObserver.disconnect();
      mainObserver.disconnect();
      mutationObserver.disconnect();
      canvas.removeEventListener("webglcontextlost", onLost);
      cards.dispose();
      for (const layer of extra) layer.dispose();
      composite.dispose();
      reader.dispose();
      renderer.dispose();
      canvas.remove();
      const w = window as unknown as { __libraryWorld?: unknown };
      if (w.__libraryWorld === probe) delete w.__libraryWorld;
    },
  };
}
