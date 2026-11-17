import * as THREE from "three";
import { LIBRARY_CONFIG } from "@/lib/vocab/library/config";
import { foldLine } from "@/lib/vocab/library/fold";
import { QualityGovernor, qualityLadder, type QualityLevel } from "@/lib/vocab/library/quality";
import { CardsLayer } from "./cards";
import { CompositePass } from "./composite";
import { colorReader, WORLD_COLORS, type Scheme } from "./palette";

/**
 * The Perpustakaan world: one fixed three.js canvas behind the page, from
 * the left edge of the main column to the right of the viewport.
 *
 * Space: the camera sits CAMERA.DISTANCE CSS px in front of the card plane
 * (z = 0) with a field of view that makes one world unit one CSS px there,
 * so DOM rects map straight onto the plane. The camera leans toward the
 * mouse and wanders a little around a pivot on that plane, so the cards
 * stay nearly anchored under their buttons while the depth swings behind.
 *
 * Frame: read the scroll, the head and the pointer; move the camera; update
 * the layers; render the scene to a target; draw it through the lens. The
 * quality governor watches frame times and steps the pixel ratio and the
 * scene down while frames miss, and hands the visit back to the DOM page
 * when nothing helps. Hidden tabs draw nothing (rAF pauses).
 */
export type LibraryWorld = {
  rescan(): void;
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
  pointer: THREE.Vector2;
  pointerActive: boolean;
  scheme: Scheme;
  fog: THREE.Color;
};

type Options = {
  page: HTMLElement;
  head: HTMLElement;
  river: HTMLElement;
  onFallback: (reason: string) => void;
  /** Extra layers (the library, particles, the cursor); built after the scene exists. */
  layers?: (scene: THREE.Scene, camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement) => WorldLayer[];
};

const { camera: CAMERA, lens: LENS } = LIBRARY_CONFIG;

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
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // display sRGB end to end: hex values show as written
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 10, CAMERA.DISTANCE + 9000);
  const composite = new CompositePass();
  const reader = colorReader(page);

  const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
  let scheme: Scheme = darkQuery.matches ? "dark" : "light";
  const fog = new THREE.Color(...WORLD_COLORS[scheme].fog);
  const fogTarget = fog.clone();
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
  const extra = layers?.(scene, camera, canvas) ?? [];
  for (const layer of extra) layer.setScheme?.(scheme);

  const ladder = qualityLadder(window.devicePixelRatio || 1);
  const params = new URLSearchParams(window.location.search);
  const forcedTier = params.get("worldtier");
  const startIndex = forcedTier ? Math.max(0, ladder.findIndex((l) => l.tier === forcedTier)) : 0;
  const governor = new QualityGovernor(ladder, startIndex, Boolean(forcedTier));

  // Size and place.
  let viewWidth = 1;
  let viewHeight = 1;
  let canvasLeft = 0;
  const applyLevel = (level: QualityLevel) => {
    renderer.setPixelRatio(level.pixelRatio);
    renderer.setSize(viewWidth, viewHeight, false);
    composite.setSize(viewWidth, viewHeight, level.pixelRatio);
    for (const layer of extra) layer.setTier?.(level.tier);
  };
  const resize = () => {
    const main = page.closest("main");
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
    fogTarget.setRGB(...WORLD_COLORS[scheme].fog);
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

  // Frame loop.
  let last = performance.now();
  let lastScroll = window.scrollY;
  let scrollSpeed = 0;
  let yaw = 0;
  let pitch = 0;
  let frameId = 0;
  const intro = sessionStorage.getItem("library-visited") ? 0 : 1;
  try {
    sessionStorage.setItem("library-visited", "1");
  } catch {
    // Private mode: every visit gets the intro.
  }
  let lastMs = 16;

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

    const scrollY = window.scrollY;
    const instant = Math.abs(scrollY - lastScroll) / Math.max(dt, 1e-3);
    lastScroll = scrollY;
    scrollSpeed += (instant - scrollSpeed) * (1 - Math.exp(-dt / 0.08));

    // Camera: lean toward the mouse, wander slowly.
    const follow = 1 - Math.exp(-dt / CAMERA.FOLLOW);
    const wander = Math.sin((clock / CAMERA.WANDER_PERIOD) * Math.PI * 2);
    yaw += ((pointerActive ? pointer.x * CAMERA.YAW : 0) + wander * CAMERA.WANDER - yaw) * follow;
    pitch += ((pointerActive ? pointer.y * CAMERA.PITCH : 0) + Math.cos((clock / CAMERA.WANDER_PERIOD) * Math.PI * 1.3) * CAMERA.WANDER * 0.6 - pitch) * follow;
    const ry = (yaw * Math.PI) / 180;
    const rx = (pitch * Math.PI) / 180;
    camera.position.set(Math.sin(ry) * Math.cos(rx), Math.sin(rx), Math.cos(ry) * Math.cos(rx)).multiplyScalar(CAMERA.DISTANCE);
    camera.lookAt(0, 0, 0);

    fog.lerp(fogTarget, 1 - Math.exp(-dt / 0.5));

    const headBottom = head.getBoundingClientRect().bottom;
    cards.update({
      time: clock,
      dt,
      scrollY,
      scrollSpeed,
      viewWidth,
      viewHeight,
      canvasLeft,
      foldLine: foldLine(headBottom, viewHeight),
      fog,
      fogDepth: 2600,
    });
    const layerFrame: LayerFrame = { time: clock, dt, scrollY, scrollSpeed, viewWidth, viewHeight, pointer, pointerActive, scheme, fog };
    for (const layer of extra) layer.update(layerFrame);

    // Lens: settles from a stronger warp on a first visit; smear follows the scroll speed.
    const settle = intro * Math.max(0, 1 - clock / LENS.SETTLE);
    const u = composite.material.uniforms;
    u.uBarrel.value = LENS.BARREL * (1 + (LENS.INTRO_WARP - 1) * settle * settle);
    // The split is SPLIT px at the corner of a 1440 px wide screen; the shader scales it by r⁴ (about 0.46 at a corner).
    u.uSplit.value = (LENS.SPLIT * (viewWidth / 1440) * renderer.getPixelRatio()) / 0.46;
    u.uBlur.value = Math.min(LENS.BLUR_MAX, (scrollSpeed / LENS.BLUR_SPEED) * LENS.BLUR_MAX) / viewHeight;
    u.uGrain.value = LENS.GRAIN * (scheme === "dark" ? 1 : 0.7);
    u.uVignette.value = LENS.VIGNETTE * (scheme === "dark" ? 1 : 0.6);
    u.uTime.value = clock;
    const pulseAge = clock - pulseStart;
    u.uPulse.value.set(pulseAt.x, pulseAt.y, pulseAge, pulseAge < 1.2 ? 1 - pulseAge / 1.2 : 0);

    renderer.setRenderTarget(composite.target);
    renderer.render(scene, camera);
    composite.render(renderer);
  };
  frameId = requestAnimationFrame(frame);

  // Dev and verification probe.
  const probe = { stats: () => ({ mode: "gl", fps: Math.round(1000 / Math.max(1, lastMs)), level: governor.level, scheme, ...cards.stats }) };
  (window as unknown as { __libraryWorld?: typeof probe }).__libraryWorld = probe;

  return {
    rescan: () => cards.scan(),
    dispose() {
      cancelAnimationFrame(frameId);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", resize);
      darkQuery.removeEventListener("change", onScheme);
      resizeObserver.disconnect();
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
