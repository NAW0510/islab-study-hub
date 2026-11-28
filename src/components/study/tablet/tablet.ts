import * as THREE from "three";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { TABLET_CONFIG } from "@/lib/study/tablet/config";
import { nearestTerm, regionAt, type PlaneRegion, type PlaneTerm } from "@/lib/study/tablet/map2d";
import { Hologram, type HologramInput } from "./hologram";

/**
 * The Istilah Teknis book, opened: a three.js scene over the Perpustakaan.
 *
 * Like the Bahasa book, it starts exactly on its sheet (the sheet's face is
 * the cover), lifts off and lays itself down while the library's fog
 * closes. Then it turns into a tablet: the pages press flat into a thin
 * body, a sweep of light turns the printed cover into dark glass, the bezel
 * lights up, the screen wakes, and a beam rises with the Peta Otak in it:
 *
 *   2D  the flat map: terms as points in their field's colour, each field's
 *       region (outline, glass fill) and its name floating at its middle;
 *   3D  the Peta Otak 3D's own views (Luar angkasa, Otak, Kubus), the same
 *       scenes as its full screen, turned by hand or by "Putar otomatis"
 *       (hologram.ts).
 *
 * Hovering names a term or a field; a term's click flies the camera to it
 * (the host opens its panel; in 3D the hologram turns and zooms to it, as in
 * full screen); a field's click is the host's to follow (its room in the
 * Perpustakaan). Closing either lands the book back on its
 * sheet (`fly`: the hologram sinks, the screen goes dark and becomes the
 * cover again, the tablet thickens into a book) or rushes into the hologram
 * while the fog clears onto a field's room (`dive`).
 *
 * The canvas is transparent over `backdrop` (the library's fog), whose
 * opacity this drives. Numbers: lib/study/tablet/config.ts.
 */

export type TabletColors = {
  holo: string;
  fog: string;
  paper: string;
  ink: string;
  /** The cover's deep tone (its back and spine while it is a book). */
  deep: string;
};

export type TabletMap = {
  terms: PlaneTerm[];
  regions: PlaneRegion[];
  /** Field id → CSS colour (#rrggbb); `none` for terms without a field. */
  colors: ReadonlyMap<string, string>;
  none: string;
  /** Field id → name, for its floating label. */
  names: ReadonlyMap<string, string>;
};

export type TabletView = "2d" | "3d";
export type TabletHover = { kind: "term" | "field"; id: string; label: string; detail?: string | null } | null;
export type { HologramInput };

export type TabletOptions = {
  host: HTMLElement;
  backdrop: HTMLElement;
  cover: HTMLCanvasElement;
  aspect: number;
  /** Where the sheet rests on the shelf; null: come back already a tablet (from a room, a page, a direct visit). */
  from: DOMRect | null;
  colors: TabletColors;
  dark: boolean;
  map: TabletMap;
  view: TabletView;
  onHover: (hover: TabletHover, x: number, y: number) => void;
  onPickTerm: (id: string | null) => void;
  onPickField: (id: string) => void;
  onStarted: () => void;
  onCovered: () => void;
  onSettled: () => void;
};

export type Tablet = {
  setMap(map: TabletMap): void;
  /** The 3D view and its data (colours are read now, in the overlay's scheme). */
  setHologram(input: HologramInput): void;
  setView(view: TabletView): void;
  setAutoRotate(on: boolean): void;
  /** The hologram back to its view's own framing. */
  resetHologram(): void;
  /** The focused term's nearest terms, for the hologram's lines to them. */
  setNeighbours(id: string, list: readonly { id: string; similarity: number }[]): void;
  focusTerm(id: string | null): void;
  highlightField(id: string | null): void;
  setInsets(left: number, right: number, bottom?: number, top?: number): void;
  setScheme(dark: boolean, colors: TabletColors): void;
  skip(): void;
  close(to: DOMRect | null, style: "fly" | "dive"): Promise<void>;
  dispose(): void;
};

const { book: BOOK, map2d: MAP, hologram: HOLOGRAM, camera: CAM, open: OPEN, close: CLOSE, holo: HOLO } = TABLET_CONFIG;

/** The tablet's own materials: parts of a picture, not UI (like the library's palette.ts). */
const DEVICE = {
  light: { body: "#2b3038", glass: "#0b0e13" },
  dark: { body: "#3a404a", glass: "#06080c" },
} as const;

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const span = (t: number, start: number, length: number) => clamp01((t - start) / length);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeIn = (t: number) => t * t * t;

function rgb(css: string): THREE.Color {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(css);
  return m ? new THREE.Color(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255) : new THREE.Color(0.5, 0.8, 0.9);
}

function texture(canvas: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.NoColorSpace; // shown as written, like the library
  t.anisotropy = 4;
  return t;
}

// ------------------------------------------------------------------ shaders

const SCREEN_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** The cover's face: the printed sheet, swept left to right into dark glass, which then wakes. */
const SCREEN_FRAGMENT = /* glsl */ `
  uniform sampler2D uCover;
  uniform float uMorph;
  uniform float uOn;
  uniform float uTime;
  uniform vec3 uGlass;
  uniform vec3 uHolo;
  varying vec2 vUv;
  void main() {
    vec3 cover = texture2D(uCover, vUv).rgb;
    float sweep = uMorph * 1.3 - 0.15;
    float edge = vUv.x - sweep;
    float glassSide = 1.0 - smoothstep(-0.015, 0.015, edge);
    float sheen = smoothstep(0.28, 0.0, abs(vUv.x * 0.8 - vUv.y * 0.5 - 0.15)) * 0.05;
    vec3 glass = uGlass * (0.85 + 0.3 * vUv.y) + vec3(sheen);
    vec2 g = abs(fract(vUv * vec2(28.0, 15.0)) - 0.5);
    float grid = smoothstep(0.46, 0.5, max(g.x, g.y));
    float glow = smoothstep(0.75, 0.0, length((vUv - 0.5) * vec2(1.0, 1.6)));
    float scan = 0.85 + 0.15 * sin((vUv.y * 120.0 - uTime * 3.0) * 6.2831);
    vec3 screen = glass + uHolo * uOn * (grid * 0.14 + glow * 0.32) * scan;
    float line = smoothstep(0.035, 0.0, abs(edge)) * step(uMorph, 0.999) * step(0.001, uMorph);
    gl_FragColor = vec4(mix(cover, screen, glassSide) + uHolo * line, 1.0);
  }
`;

const POINT_VERTEX = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aIndex;
  attribute float aField;
  attribute float aReveal;
  uniform float uScale;
  uniform float uReveal;
  uniform float uHover;
  uniform float uSelected;
  uniform float uHighlight;
  uniform float uDim;
  uniform float uTime;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float hover = 1.0 - step(0.5, abs(aIndex - uHover));
    float selected = 1.0 - step(0.5, abs(aIndex - uSelected));
    float lifted = uHighlight < -0.5 ? 0.0 : 1.0 - step(0.5, abs(aField - uHighlight));
    float shown = clamp((uReveal - aReveal) / 0.12, 0.0, 1.0);
    float dim = mix(1.0, ${HOLO.DIM.toFixed(2)}, uDim * (1.0 - max(selected, lifted)));
    gl_PointSize = aSize * (1.0 + 0.6 * hover + 1.0 * selected + 0.3 * lifted) * shown * uScale / max(0.05, -mv.z);
    vColor = aColor;
    vAlpha = dim * shown * (0.85 + 0.15 * sin(uTime * 2.3 + aIndex * 1.7));
    gl_Position = projectionMatrix * mv;
  }
`;

const POINT_FRAGMENT = /* glsl */ `
  uniform float uAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.0, d);
    float rim = smoothstep(0.5, 0.38, d) * 0.35;
    gl_FragColor = vec4(vColor * (0.55 + 0.9 * core), (core * 0.95 + rim) * vAlpha * uAlpha);
  }
`;

const FILL_VERTEX = /* glsl */ `
  attribute vec3 aColor;
  attribute float aField;
  uniform float uSize;
  varying vec3 vColor;
  varying float vField;
  varying float vY;
  void main() {
    vColor = aColor;
    vField = aField;
    vY = position.y / uSize + 0.5;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FILL_FRAGMENT = /* glsl */ `
  uniform float uReveal;
  uniform float uHighlight;
  uniform float uDim;
  uniform float uTime;
  uniform float uAlpha;
  uniform vec2 uLevels;
  varying vec3 vColor;
  varying float vField;
  varying float vY;
  void main() {
    float edge = vY - uReveal;
    if (edge > 0.0) discard;
    float lifted = uHighlight < -0.5 ? 0.0 : 1.0 - step(0.5, abs(vField - uHighlight));
    float lines = 0.72 + 0.28 * sin((vY * 160.0 - uTime * 2.2) * 6.2831);
    float alpha = mix(uLevels.x, uLevels.y, lifted) * lines * mix(1.0, ${HOLO.DIM.toFixed(2)}, uDim * (1.0 - lifted));
    alpha += smoothstep(-0.03, 0.0, edge) * 0.5;
    gl_FragColor = vec4(vColor, alpha * uAlpha);
  }
`;

const BEAM_VERTEX = /* glsl */ `
  attribute float aRise;
  varying float vRise;
  varying vec2 vUv;
  void main() {
    vRise = aRise;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BEAM_FRAGMENT = /* glsl */ `
  uniform vec3 uColour;
  uniform float uIntensity;
  uniform float uTime;
  varying float vRise;
  varying vec2 vUv;
  void main() {
    float fall = pow(1.0 - vRise, 1.6);
    float streaks = 0.65 + 0.35 * sin(vUv.x * 40.0 + uTime * 0.7) * sin(vUv.x * 13.0 - uTime * 0.4);
    float pulse = 0.8 + 0.2 * sin((vRise * 9.0 - uTime * 1.6) * 6.2831);
    gl_FragColor = vec4(uColour, fall * streaks * pulse * uIntensity);
  }
`;

/** A field's name as a floating label: its colour on a soft halo of the fog. */
function labelTexture(text: string, colour: string, halo: string): { texture: THREE.CanvasTexture; aspect: number } {
  const px = HOLO.LABEL_PX;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const font = `600 ${px}px ${getComputedStyle(document.body).fontFamily}`;
  ctx.font = font;
  const width = Math.ceil(ctx.measureText(text).width) + px;
  canvas.width = width;
  canvas.height = Math.ceil(px * 1.6);
  ctx.font = font;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.shadowColor = halo;
  ctx.shadowBlur = px * 0.45;
  ctx.fillStyle = colour;
  ctx.fillText(text, width / 2, canvas.height / 2);
  ctx.shadowBlur = 0;
  ctx.fillText(text, width / 2, canvas.height / 2);
  return { texture: texture(canvas), aspect: width / canvas.height };
}

function edgesTexture(paper: string, ink: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 64;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, 8, 64);
  ctx.fillStyle = ink;
  for (let y = 1; y < 64; y += 3) {
    ctx.globalAlpha = 0.05 + 0.05 * ((y * 7) % 3);
    ctx.fillRect(0, y, 8, 1);
  }
  return canvas;
}

export async function createTablet(opts: TabletOptions): Promise<Tablet> {
  const stamp = (name: string) => performance.mark(`tablet:${name}`);
  stamp("create");
  const { host, backdrop } = opts;
  const canvas = document.createElement("canvas");
  canvas.className = "atlas-canvas";
  canvas.setAttribute("aria-hidden", "true");
  host.prepend(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance", failIfMajorPerformanceCaveat: true });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(pixelRatio);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAM.FOV, 1, 0.05, 200);
  let colors = opts.colors;
  let dark = opts.dark;
  const holo = rgb(colors.holo);
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const blending = () => (dark ? THREE.AdditiveBlending : THREE.NormalBlending);

  // ---------------------------------------------------------------- the book, which becomes a tablet
  const H = BOOK.HEIGHT;
  const W = H * opts.aspect;
  const T = BOOK.THICKNESS;
  const C = BOOK.COVER;
  const blockH = T - 2 * C;
  const restScale = BOOK.REST_SCALE;
  const deep = rgb(colors.deep);
  const device = () => DEVICE[dark ? "dark" : "light"];

  const book = new THREE.Group();
  scene.add(book);
  const edgeTex = keep(texture(edgesTexture(colors.paper, colors.ink)));
  edgeTex.wrapS = edgeTex.wrapT = THREE.RepeatWrapping;
  edgeTex.repeat.set(1, 3);
  const coverTex = keep(texture(opts.cover));
  const backMat = keep(new THREE.MeshBasicMaterial({ color: deep.clone() }));
  const sideMat = keep(new THREE.MeshBasicMaterial({ color: deep.clone().multiplyScalar(0.78) }));
  const edgeMat = keep(new THREE.MeshBasicMaterial({ map: edgeTex, color: new THREE.Color(0.92, 0.92, 0.92) }));
  const screenUniforms = {
    uCover: { value: coverTex },
    uMorph: { value: 0 },
    uOn: { value: 0 },
    uTime: { value: 0 },
    uGlass: { value: rgb(device().glass) },
    uHolo: { value: holo.clone() },
  };
  const screenMat = keep(new THREE.ShaderMaterial({ vertexShader: SCREEN_VERTEX, fragmentShader: SCREEN_FRAGMENT, uniforms: screenUniforms }));

  const back = new THREE.Mesh(keep(new THREE.BoxGeometry(W, C, H)), [sideMat, sideMat, backMat, backMat, sideMat, sideMat]);
  back.position.y = C / 2;
  book.add(back);
  const block = new THREE.Mesh(keep(new THREE.BoxGeometry(W * 0.97, blockH, H * 0.96)), [edgeMat, edgeMat, edgeMat, edgeMat, edgeMat, edgeMat]);
  book.add(block);
  const cover = new THREE.Mesh(keep(new THREE.BoxGeometry(W, C, H)), [sideMat, sideMat, screenMat, backMat, sideMat, sideMat]);
  book.add(cover);

  // The bezel, lit as the glass arrives, and a camera dot on the top edge.
  const bx = W / 2 - W * 0.035;
  const bz = H / 2 - H * 0.05;
  const bezelGeometry = keep(new LineSegmentsGeometry());
  bezelGeometry.setPositions([-bx, 0, -bz, bx, 0, -bz, bx, 0, -bz, bx, 0, bz, bx, 0, bz, -bx, 0, bz, -bx, 0, bz, -bx, 0, -bz]);
  const bezelMat = keep(new LineMaterial({ color: holo.clone(), linewidth: 1.6, transparent: true, opacity: 0, depthWrite: false }));
  const bezel = new LineSegments2(bezelGeometry, bezelMat);
  cover.add(bezel);
  const dotMat = keep(new THREE.MeshBasicMaterial({ color: holo.clone(), transparent: true, opacity: 0 }));
  const lens = new THREE.Mesh(keep(new THREE.CircleGeometry(0.018, 16)), dotMat);
  lens.rotation.x = -Math.PI / 2;
  lens.position.set(0, C / 2 + 0.003, -H / 2 + H * 0.025);
  cover.add(lens);

  /** Pages press flat and the cover settles onto them (0 a book … 1 a tablet). */
  const shapeBook = (morph: number) => {
    const k = 1 - (1 - BOOK.TABLET_BLOCK) * morph;
    block.scale.y = k;
    block.position.set(W * 0.015 * (1 - morph), C + (blockH * k) / 2, 0);
    cover.position.y = C + blockH * k + C / 2;
    bezel.position.y = C / 2 + 0.002;
    const body = rgb(device().body);
    backMat.color.copy(deep).lerp(body, morph);
    sideMat.color.copy(deep).multiplyScalar(0.78).lerp(body.clone().multiplyScalar(0.8), morph);
    edgeMat.color.setRGB(0.92, 0.92, 0.92).lerp(body, morph);
    screenUniforms.uMorph.value = morph;
    bezelMat.opacity = clamp01(morph * 1.4 - 0.4) * 0.9;
  };
  shapeBook(0);

  // A soft shadow under it.
  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = shadowCanvas.height = 128;
  {
    const ctx = shadowCanvas.getContext("2d") as CanvasRenderingContext2D;
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, "rgba(0,0,0,0.38)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  const shadowMat = keep(new THREE.MeshBasicMaterial({ map: keep(texture(shadowCanvas)), transparent: true, depthWrite: false }));
  const shadow = new THREE.Mesh(keep(new THREE.PlaneGeometry(1, 1)), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);

  // ---------------------------------------------------------------- 2D: the flat Peta Otak
  const pointUniforms = () => ({
    uScale: { value: 1 },
    uReveal: { value: 0 },
    uHover: { value: -1 },
    uSelected: { value: -1 },
    uHighlight: { value: -1 },
    uDim: { value: 0 },
    uTime: { value: 0 },
    uAlpha: { value: 1 },
  });
  const pointMaterial = (uniforms: ReturnType<typeof pointUniforms>) =>
    keep(new THREE.ShaderMaterial({ vertexShader: POINT_VERTEX, fragmentShader: POINT_FRAGMENT, uniforms, transparent: true, depthWrite: false, blending: blending() }));

  const flat = new THREE.Group(); // tilted, floating
  flat.position.set(...MAP.CENTER);
  flat.rotation.x = MAP.TILT;
  scene.add(flat);
  const flatRise = new THREE.Group(); // grows out of the screen
  flat.add(flatRise);

  const fillUniforms = {
    uReveal: { value: 0 },
    uHighlight: { value: -1 },
    uDim: { value: 0 },
    uTime: { value: 0 },
    uAlpha: { value: 1 },
    uLevels: { value: new THREE.Vector2(HOLO.FILL, HOLO.FILL_HIGHLIGHT) },
    uSize: { value: MAP.SIZE },
  };
  const fillMat = keep(new THREE.ShaderMaterial({ vertexShader: FILL_VERTEX, fragmentShader: FILL_FRAGMENT, uniforms: fillUniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  const fill = new THREE.Mesh(keep(new THREE.BufferGeometry()), fillMat);
  fill.renderOrder = 1;
  flatRise.add(fill);
  const outlineMat = keep(new LineMaterial({ color: 0xffffff, vertexColors: true, linewidth: HOLO.LINE_WIDTH, transparent: true, opacity: 0, depthWrite: false }));
  const outlineGeometry = keep(new LineSegmentsGeometry());
  const outline = new LineSegments2(outlineGeometry, outlineMat);
  outline.renderOrder = 2;
  flatRise.add(outline);
  const flatPointUniforms = pointUniforms();
  const flatPointMat = pointMaterial(flatPointUniforms);
  const flatPoints = new THREE.Points(keep(new THREE.BufferGeometry()), flatPointMat);
  flatPoints.renderOrder = 3;
  flatRise.add(flatPoints);
  const labels = new THREE.Group();
  flatRise.add(labels);
  const labelMats: THREE.SpriteMaterial[] = [];

  // A frame with corner brackets, like the atlas's.
  const hs = MAP.SIZE / 2 + 0.15;
  const corner = 0.32;
  const frameGeometry = keep(new LineSegmentsGeometry());
  frameGeometry.setPositions(
    [
      [-hs, hs - corner, -hs, hs], [-hs, hs, -hs + corner, hs], [hs - corner, hs, hs, hs], [hs, hs, hs, hs - corner],
      [hs, -hs + corner, hs, -hs], [hs, -hs, hs - corner, -hs], [-hs + corner, -hs, -hs, -hs], [-hs, -hs, -hs, -hs + corner],
    ].flatMap(([x0, y0, x1, y1]) => [x0, y0, 0, x1, y1, 0]),
  );
  const frameMat = keep(new LineMaterial({ color: holo.clone(), linewidth: 1.6, transparent: true, opacity: 0, depthWrite: false }));
  flatRise.add(new LineSegments2(frameGeometry, frameMat));

  // The focus ring on a picked term.
  const ringMat = keep(new THREE.MeshBasicMaterial({ color: holo.clone(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  const ring = new THREE.Mesh(keep(new THREE.RingGeometry(0.075, 0.095, 48)), ringMat);
  ring.visible = false;
  scene.add(ring);

  let mapData = opts.map;
  const fieldIndex = new Map<string, number>();
  const indexOfField = (id: string | null) => {
    if (!id) return -1;
    let i = fieldIndex.get(id);
    if (i === undefined) fieldIndex.set(id, (i = fieldIndex.size));
    return i;
  };
  const colourOf = (fieldId: string | null) => rgb(fieldId ? (mapData.colors.get(fieldId) ?? mapData.none) : mapData.none);

  const buildFlat = () => {
    // Region glass and outlines.
    const pos: number[] = [];
    const col: number[] = [];
    const fld: number[] = [];
    const segs: number[] = [];
    const segCol: number[] = [];
    for (const region of mapData.regions) {
      const c = colourOf(region.fieldId);
      const fi = indexOfField(region.fieldId);
      const contour = region.ring.map(([x, y]) => new THREE.Vector2(x, y));
      for (const [a, b, d] of THREE.ShapeUtils.triangulateShape(contour, [])) {
        for (const k of [a, b, d]) {
          pos.push(contour[k].x, contour[k].y, -0.002);
          col.push(c.r, c.g, c.b);
          fld.push(fi);
        }
      }
      for (let i = 0; i < region.ring.length; i++) {
        const [x0, y0] = region.ring[i];
        const [x1, y1] = region.ring[(i + 1) % region.ring.length];
        segs.push(x0, y0, 0, x1, y1, 0);
        segCol.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    fg.setAttribute("aColor", new THREE.Float32BufferAttribute(col, 3));
    fg.setAttribute("aField", new THREE.Float32BufferAttribute(fld, 1));
    fill.geometry.dispose();
    fill.geometry = fg;
    if (segs.length) {
      outlineGeometry.setPositions(segs);
      outlineGeometry.setColors(segCol);
    }
    outline.visible = segs.length > 0;

    // Points.
    const pp: number[] = [];
    const pc: number[] = [];
    const ps: number[] = [];
    const pi: number[] = [];
    const pf: number[] = [];
    const pr: number[] = [];
    mapData.terms.forEach((t, i) => {
      const c = colourOf(t.fieldId);
      pp.push(t.x, t.y, 0.004);
      pc.push(c.r, c.g, c.b);
      ps.push(MAP.POINT);
      pi.push(i);
      pf.push(indexOfField(t.fieldId));
      pr.push(clamp01(t.y / MAP.SIZE + 0.5));
    });
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.Float32BufferAttribute(pp, 3));
    pg.setAttribute("aColor", new THREE.Float32BufferAttribute(pc, 3));
    pg.setAttribute("aSize", new THREE.Float32BufferAttribute(ps, 1));
    pg.setAttribute("aIndex", new THREE.Float32BufferAttribute(pi, 1));
    pg.setAttribute("aField", new THREE.Float32BufferAttribute(pf, 1));
    pg.setAttribute("aReveal", new THREE.Float32BufferAttribute(pr, 1));
    flatPoints.geometry.dispose();
    flatPoints.geometry = pg;

    // Field names.
    for (const sprite of [...labels.children] as THREE.Sprite[]) {
      sprite.material.map?.dispose();
      sprite.material.dispose();
      labels.remove(sprite);
    }
    labelMats.length = 0;
    for (const region of mapData.regions) {
      const name = mapData.names.get(region.fieldId);
      if (!name) continue;
      const { texture: tex, aspect } = labelTexture(name, mapData.colors.get(region.fieldId) ?? colors.holo, colors.fog);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 });
      labelMats.push(mat);
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(HOLO.LABEL_HEIGHT * aspect, HOLO.LABEL_HEIGHT, 1);
      sprite.position.set(region.center[0], region.center[1], 0.06);
      labels.add(sprite);
    }
  };
  buildFlat();

  // ---------------------------------------------------------------- 3D: the hologram (hologram.ts)
  const hologram = new Hologram(canvas, host, new THREE.Vector3(...CAM.OVERVIEW.position));

  // ---------------------------------------------------------------- beam and dust
  const restTop = new THREE.Vector3(BOOK.REST[0], BOOK.REST[1] + (2 * C + blockH * BOOK.TABLET_BLOCK) * restScale, BOOK.REST[2]);
  const topCorners = [
    [-MAP.SIZE / 2, -MAP.SIZE / 2],
    [MAP.SIZE / 2, -MAP.SIZE / 2],
    [MAP.SIZE / 2, MAP.SIZE / 2],
    [-MAP.SIZE / 2, MAP.SIZE / 2],
  ].map(([x, y]) => new THREE.Vector3(x * 0.92, y * 0.92, 0).applyEuler(new THREE.Euler(MAP.TILT, 0, 0)).add(new THREE.Vector3(...MAP.CENTER)));
  const baseCorners = [
    [-W * 0.4, H * 0.32],
    [W * 0.4, H * 0.32],
    [W * 0.4, -H * 0.32],
    [-W * 0.4, -H * 0.32],
  ].map(([x, z]) => new THREE.Vector3(restTop.x + x * restScale, restTop.y + 0.01, restTop.z + z * restScale));
  const beamPos: number[] = [];
  const beamRise: number[] = [];
  const beamUv: number[] = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const quad = [baseCorners[i], baseCorners[j], topCorners[j], baseCorners[i], topCorners[j], topCorners[i]];
    const rises = [0, 0, 1, 0, 1, 1];
    const us = [i, i + 1, i + 1, i, i + 1, i];
    quad.forEach((p, k) => {
      beamPos.push(p.x, p.y, p.z);
      beamRise.push(rises[k]);
      beamUv.push(us[k] / 4, rises[k]);
    });
  }
  const beamGeometry = keep(new THREE.BufferGeometry());
  beamGeometry.setAttribute("position", new THREE.Float32BufferAttribute(beamPos, 3));
  beamGeometry.setAttribute("aRise", new THREE.Float32BufferAttribute(beamRise, 1));
  beamGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(beamUv, 2));
  const beamUniforms = { uColour: { value: holo.clone() }, uIntensity: { value: 0 }, uTime: { value: 0 } };
  const beamMat = keep(new THREE.ShaderMaterial({ vertexShader: BEAM_VERTEX, fragmentShader: BEAM_FRAGMENT, uniforms: beamUniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  const beam = new THREE.Mesh(beamGeometry, beamMat);
  scene.add(beam);

  // ---------------------------------------------------------------- scheme
  const applyScheme = () => {
    const c = rgb(colors.holo);
    holo.copy(c);
    for (const m of [fillMat, outlineMat, frameMat, flatPointMat, beamMat, ringMat, bezelMat, dotMat]) {
      m.blending = blending();
      m.needsUpdate = true;
    }
    const alpha = dark ? 1 : HOLO.LIGHT_ALPHA;
    fillUniforms.uAlpha.value = alpha;
    flatPointUniforms.uAlpha.value = alpha;
    beamUniforms.uColour.value.copy(c);
    screenUniforms.uHolo.value.copy(c);
    screenUniforms.uGlass.value.copy(rgb(device().glass));
    for (const m of [frameMat, bezelMat, dotMat]) m.color.copy(c);
    backdrop.style.backgroundColor = colors.fog;
  };

  // ---------------------------------------------------------------- camera
  let viewWidth = 1;
  let viewHeight = 1;
  let insetLeft = 0;
  let insetRight = 0;
  let insetBottom = 0;
  let insetTop = 0;
  let viewShift = 0;
  let viewLift = 0;
  const camPos = new THREE.Vector3(...CAM.BOOK.position);
  const camTarget = new THREE.Vector3(...CAM.BOOK.target);
  type Flight = { fromPos: THREE.Vector3; fromTarget: THREE.Vector3; toPos: THREE.Vector3; toTarget: THREE.Vector3; start: number; time: number };
  let flight: Flight | null = null;
  const flyTo = (pos: THREE.Vector3, target: THREE.Vector3, time: number) => {
    flight = { fromPos: camPos.clone(), fromTarget: camTarget.clone(), toPos: pos.clone(), toTarget: target.clone(), start: clock, time };
  };
  /** The whole hologram, pulled back on narrow (portrait) screens until it fits. */
  const overview = () => {
    const target = new THREE.Vector3(...CAM.OVERVIEW.target);
    const pos = new THREE.Vector3(...CAM.OVERVIEW.position);
    const tanH = Math.tan(THREE.MathUtils.degToRad(CAM.FOV / 2)) * (viewWidth / viewHeight) * Math.max(0.4, 1 - (insetLeft + insetRight) / viewWidth);
    const fit = (MAP.SIZE * 0.62) / tanH;
    const away = pos.clone().sub(target);
    if (fit > away.length()) pos.copy(target).addScaledVector(away.normalize(), fit);
    return { pos, target };
  };
  /**
   * In 3D the camera keeps the overview's line of sight on the hologram and
   * comes closer as the hologram's orbit does (zoom 1: the overview).
   */
  const holoCentre = new THREE.Vector3(...HOLOGRAM.CENTER);
  let zoom = 1;
  const rig = (z: number) => {
    const o = overview();
    return { pos: holoCentre.clone().lerp(o.pos, z), target: holoCentre.clone().lerp(o.target, z) };
  };
  let rigBlend: { pos: THREE.Vector3; target: THREE.Vector3; start: number } | null = null;
  const resize = () => {
    viewWidth = Math.max(1, host.clientWidth);
    viewHeight = Math.max(1, host.clientHeight);
    renderer.setSize(viewWidth, viewHeight, false);
    camera.aspect = viewWidth / viewHeight;
    camera.updateProjectionMatrix();
    for (const m of [outlineMat, frameMat, bezelMat]) m.resolution.set(viewWidth * pixelRatio, viewHeight * pixelRatio);
    const scale = (viewHeight * pixelRatio) / (2 * Math.tan(THREE.MathUtils.degToRad(CAM.FOV / 2)));
    flatPointUniforms.uScale.value = scale;
  };
  resize();
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);

  // ---------------------------------------------------------------- the book's poses
  const poseOnRect = (rect: DOMRect) => {
    const cam = new THREE.PerspectiveCamera(CAM.FOV, viewWidth / viewHeight, 0.05, 200);
    cam.position.set(...CAM.BOOK.position);
    cam.lookAt(new THREE.Vector3(...CAM.BOOK.target));
    cam.updateMatrixWorld(true);
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(CAM.FOV / 2));
    const depth = (H * viewHeight) / (2 * tanHalf * Math.max(1, rect.height));
    const ndc = new THREE.Vector3(((rect.left + rect.width / 2) / viewWidth) * 2 - 1, -(((rect.top + rect.height / 2) / viewHeight) * 2 - 1), 0.5);
    const dir = ndc.unproject(cam).sub(cam.position).normalize();
    const forward = new THREE.Vector3();
    cam.getWorldDirection(forward);
    const along = depth / Math.max(0.2, dir.dot(forward));
    const coverCentre = cam.position.clone().addScaledVector(dir, along);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const backward = forward.clone().negate();
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, backward, up.clone().negate()));
    return { position: coverCentre.clone().addScaledVector(backward, -T), quaternion, scale: 1 };
  };
  type Pose = { position: THREE.Vector3; quaternion: THREE.Quaternion; scale: number };
  const rest: Pose = { position: new THREE.Vector3(...BOOK.REST), quaternion: new THREE.Quaternion(), scale: restScale };
  const startPose: Pose = opts.from
    ? poseOnRect(opts.from)
    : { position: rest.position.clone().add(new THREE.Vector3(0, 0.9, 0.6)), quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.9, 0, 0)), scale: restScale };
  const placeBook = (from: Pose, to: Pose, k: number, arc: number) => {
    book.position.lerpVectors(from.position, to.position, k);
    book.position.y += Math.sin(Math.PI * k) * arc;
    book.quaternion.slerpQuaternions(from.quaternion, to.quaternion, k);
    book.scale.setScalar(from.scale + (to.scale - from.scale) * k);
  };

  // ---------------------------------------------------------------- input
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const lean = new THREE.Vector2();
  let pointerActive = false;
  let phase: "open" | "idle" | "closing" = "open";
  let view: TabletView = opts.view;
  let viewMix = view === "3d" ? 1 : 0;
  let hoverIndex = -1;
  let hoverField = -1;
  let selected: string | null = null;
  let highlight = -1;
  const plane = new THREE.Plane();
  const hit = new THREE.Vector3();

  const rayFrom = (clientX: number, clientY: number) => {
    const rect = host.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
    raycaster.setFromCamera(pointer, camera);
  };
  /** What is under the pointer on the flat map: a term or a field. */
  const pick = (clientX: number, clientY: number): { kind: "term"; index: number } | { kind: "field"; id: string } | null => {
    rayFrom(clientX, clientY);
    {
      const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(flatRise.getWorldQuaternion(new THREE.Quaternion()));
      plane.setFromNormalAndCoplanarPoint(normal, flatRise.getWorldPosition(new THREE.Vector3()));
      if (!raycaster.ray.intersectPlane(plane, hit)) return null;
      const local = flatRise.worldToLocal(hit.clone());
      const near = nearestTerm(mapData.terms, local.x, local.y, (MAP.PICK * MAP.SIZE) / 2 + 0.02);
      if (near) return { kind: "term", index: mapData.terms.indexOf(near) };
      const region = regionAt(mapData.regions, local.x, local.y);
      return region ? { kind: "field", id: region.fieldId } : null;
    }
  };
  const termAt = (index: number): { id: string; term: string; fieldId: string | null } | null => mapData.terms[index] ?? null;
  /** The hologram's term under the pointer (3D), as the full screen picks. */
  const pickHolo = (clientX: number, clientY: number, touch: boolean) => {
    const rect = host.getBoundingClientRect();
    return hologram.pick(clientX - rect.left, clientY - rect.top, touch, camera, rect.width, rect.height);
  };
  let holoHover: string | null = null;

  const onMove = (e: PointerEvent) => {
    pointerActive = e.pointerType === "mouse";
    const rect = host.getBoundingClientRect();
    lean.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -(((e.clientY - rect.top) / rect.height) * 2 - 1));
    if (phase !== "idle" || e.pointerType !== "mouse") return;
    if (view === "3d") {
      // Dragging turns the hologram: no hover then.
      const id = e.buttons === 0 ? pickHolo(e.clientX, e.clientY, false) : null;
      if (id !== holoHover) {
        holoHover = id;
        hologram.setHover(id);
        canvas.style.cursor = id ? "pointer" : "";
      }
      const about = id ? hologram.describe(id) : null;
      opts.onHover(about ? { kind: "term", id: id as string, label: about.label, detail: about.detail } : null, e.clientX, e.clientY);
      return;
    }
    const found = pick(e.clientX, e.clientY);
    const nextIndex = found?.kind === "term" ? found.index : -1;
    const nextField = found?.kind === "field" ? indexOfField(found.id) : -1;
    if (nextIndex !== hoverIndex || nextField !== hoverField) {
      hoverIndex = nextIndex;
      hoverField = nextField;
      canvas.style.cursor = found ? "pointer" : "";
    }
    if (found?.kind === "term") {
      const t = termAt(found.index);
      opts.onHover(t ? { kind: "term", id: t.id, label: t.term } : null, e.clientX, e.clientY);
    } else if (found?.kind === "field") {
      opts.onHover({ kind: "field", id: found.id, label: mapData.names.get(found.id) ?? "" }, e.clientX, e.clientY);
    } else opts.onHover(null, 0, 0);
  };
  const onLeave = () => {
    hoverIndex = -1;
    hoverField = -1;
    holoHover = null;
    hologram.setHover(null);
    opts.onHover(null, 0, 0);
  };
  let downAt: { x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => {
    if (phase === "open") return skip();
    downAt = { x: e.clientX, y: e.clientY };
  };
  const onUp = (e: PointerEvent) => {
    if (phase !== "idle" || !downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) return;
    downAt = null;
    if (view === "3d") {
      opts.onPickTerm(pickHolo(e.clientX, e.clientY, e.pointerType === "touch"));
      return;
    }
    const found = pick(e.clientX, e.clientY);
    if (found?.kind === "term") opts.onPickTerm(termAt(found.index)?.id ?? null);
    else if (found?.kind === "field") opts.onPickField(found.id);
    else opts.onPickTerm(null);
  };
  const onWheel = () => {
    if (phase === "open") skip();
  };
  const onKey = () => {
    if (phase === "open") skip();
  };
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerup", onUp);
  window.addEventListener("wheel", onWheel, { passive: true });
  window.addEventListener("keydown", onKey);

  // ---------------------------------------------------------------- focus
  let dim = 0;
  let dimTarget = 0;
  let ringAge = 0;
  let pendingFocus: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;
  const focusIndex = () => (selected ? mapData.terms.findIndex((t) => t.id === selected) : -1);
  /** Where the selected term is in the world, and the camera pose that frames it. */
  const focusPose = () => {
    const index = focusIndex();
    if (index < 0) return null;
    scene.updateMatrixWorld(true);
    const t = mapData.terms[index];
    const at = flatRise.localToWorld(new THREE.Vector3(t.x, t.y, 0));
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(flatRise.getWorldQuaternion(new THREE.Quaternion()));
    // Narrow (portrait) screens stand farther back, so the term keeps its neighbours around it.
    const distance = CAM.FOCUS_DISTANCE / Math.min(1, (viewWidth / viewHeight) * 1.4);
    const pos = at.clone().addScaledVector(normal, distance).add(new THREE.Vector3(0, distance * 0.12, 0));
    return { pos, target: at, index };
  };
  const applyFocus = () => {
    // 3D: the hologram turns and zooms to the term itself; the camera follows its zoom.
    hologram.setSelected(view === "3d" ? selected : null);
    if (view === "3d") {
      flatPointUniforms.uSelected.value = -1;
      ring.visible = false;
      dimTarget = highlight >= 0 ? 1 : 0;
      return;
    }
    const pose = focusPose();
    const index = pose?.index ?? -1;
    flatPointUniforms.uSelected.value = index;
    if (!pose) {
      dimTarget = highlight >= 0 ? 1 : 0;
      ring.visible = false;
      if (phase === "idle") {
        const o = overview();
        flyTo(o.pos, o.target, CAM.FOCUS_TIME);
      }
      return;
    }
    dimTarget = 1;
    ring.visible = true;
    ringAge = 0;
    ring.position.copy(pose.target);
    const t = termAt(index);
    ringMat.color.copy(t ? colourOf(t.fieldId) : holo);
    if (phase === "idle") flyTo(pose.pos, pose.target, CAM.FOCUS_TIME);
    else pendingFocus = { pos: pose.pos, target: pose.target };
  };

  // ---------------------------------------------------------------- the loop
  let clock = 0;
  let t = opts.from ? 0 : OPEN.RESUME_AT;
  const resumed = !opts.from;
  let closeT = 0;
  let closing: { style: "fly" | "dive"; to: Pose | null; resolve: () => void; fromPos: THREE.Vector3; fromTarget: THREE.Vector3; startShift: number } | null = null;
  let started = false;
  let covered = false;
  let settled = false;
  let last = performance.now();
  let frameId = 0;

  const renderFrame = (now: number) => {
    frameId = requestAnimationFrame(renderFrame);
    // Long frames (a hidden tab, the first uploads) never skip the opening ahead.
    const dt = Math.min(phase === "open" ? 1 / 30 : 0.1, (now - last) / 1000);
    last = now;
    clock += dt;
    flatPointUniforms.uTime.value = clock;
    fillUniforms.uTime.value = clock;
    beamUniforms.uTime.value = clock;
    screenUniforms.uTime.value = clock;

    if (phase === "open") t += dt;
    const k = (start: number, length: number) => span(t, start, length);
    let lift = easeInOut(k(0, OPEN.LIFT));
    let morph = easeInOut(k(OPEN.MORPH_AT, OPEN.MORPH_TIME));
    let screen = easeOut(k(OPEN.SCREEN_AT, OPEN.SCREEN_TIME));
    let beamOn = easeOut(k(OPEN.BEAM_AT, OPEN.BEAM_TIME));
    let contentOn = easeOut(k(OPEN.CONTENT_AT, OPEN.CONTENT_TIME));
    let labelsOn = k(OPEN.LABELS_AT, 0.6);
    let fog = resumed ? easeOut(clamp01(clock / OPEN.RESUME_COVER)) : easeOut(k(0, OPEN.COVER));
    let canvasOpacity = 1;
    let rush = 0;

    if (closing) {
      closeT += dt;
      const c = (start: number, length: number) => span(closeT, start, length);
      if (closing.style === "dive") {
        const d = easeIn(c(0, CLOSE.DIVE));
        rush = d;
        fog = 1 - d;
        canvasOpacity = 1 - d;
        if (closeT >= CLOSE.DIVE) return finishClose();
      } else {
        contentOn = 1 - easeIn(c(0, CLOSE.CONTENT_TIME));
        beamOn = contentOn;
        labelsOn = contentOn;
        screen = 1 - easeOut(c(CLOSE.SCREEN_AT, CLOSE.SCREEN_TIME));
        morph = 1 - easeInOut(c(CLOSE.MORPH_AT, CLOSE.MORPH_TIME));
        const fly = easeInOut(c(CLOSE.FLY_AT, CLOSE.FLY_TIME));
        fog = 1 - easeOut(c(CLOSE.CLEAR_AT, CLOSE.END - CLOSE.CLEAR_AT));
        lift = 1;
        if (closing.to) placeBook(rest, closing.to, fly, 0.5);
        else placeBook(rest, { ...rest, scale: rest.scale * 0.85 }, fly, 0);
        const back = easeInOut(c(0, CLOSE.FLY_AT + 0.1));
        camPos.lerpVectors(closing.fromPos, new THREE.Vector3(...CAM.BOOK.position), back);
        camTarget.lerpVectors(closing.fromTarget, new THREE.Vector3(...CAM.BOOK.target), back);
        viewShift = closing.startShift * (1 - back);
        viewLift *= 1 - back;
        if (closeT >= CLOSE.END) return finishClose();
      }
    }
    if (!closing || closing.style === "dive") placeBook(startPose, rest, lift, opts.from ? 0.55 : 0.2);

    shapeBook(morph);
    screenUniforms.uOn.value = screen;
    dotMat.opacity = screen * 0.9;
    shadow.position.set(book.position.x, BOOK.REST[1] - 0.001, book.position.z);
    shadow.scale.set(W * 2.4 * restScale * (0.6 + 0.4 * lift), H * 2 * restScale, 1);
    shadowMat.opacity = lift * (dark ? 0.9 : 0.55);

    backdrop.style.opacity = String(fog);
    canvas.style.opacity = canvasOpacity < 1 ? String(canvasOpacity) : "";
    if (!covered && fog >= 0.999) {
      covered = true;
      opts.onCovered();
    }

    // 2D ↔ 3D: one sinks into the screen while the other rises.
    const want = view === "3d" ? 1 : 0;
    viewMix += (want - viewMix) * (1 - Math.exp(-dt / (TABLET_CONFIG.switchTime / 3.5)));
    if (Math.abs(want - viewMix) < 0.001) viewMix = want;
    const flatOn = contentOn * (1 - easeInOut(clamp01(viewMix * 1.6)));
    const holoOn = contentOn * easeInOut(clamp01(viewMix * 1.6 - 0.6));

    beamUniforms.uIntensity.value = beamOn * HOLO.BEAM * (dark ? 1 : 0.55) * canvasOpacity;
    beam.visible = beamOn > 0.001;

    // The flat map rises out of the screen, revealed bottom to top.
    flatRise.visible = flatOn > 0.001;
    flatRise.scale.set(0.4 + 0.6 * flatOn + rush * 0.5, Math.max(0.001, flatOn) + rush * 0.5, 1);
    flatRise.position.y = (1 - flatOn) * -(MAP.CENTER[1] - BOOK.REST[1]) * 0.85;
    fillUniforms.uReveal.value = flatOn * 1.05 - 0.02;
    flatPointUniforms.uReveal.value = flatOn * 1.2;
    outlineMat.opacity = flatOn * (dark ? 0.85 : 0.8) * (1 - dim * 0.5);
    frameMat.opacity = flatOn * (dark ? 0.55 : 0.6);
    for (const m of labelMats) m.opacity = flatOn * labelsOn * (1 - dim * 0.8);
    flat.position.y = MAP.CENTER[1] + Math.sin(clock * 0.9) * 0.03;

    // The 3D view grows out of the screen; it turns by hand (or by itself) once the tablet is idle.
    zoom = hologram.update(dt, clock, { on: holoOn, rush, active: phase === "idle" && !closing && view === "3d", fov: CAM.FOV });

    // Highlight and dim.
    dim += (dimTarget - dim) * (1 - Math.exp(-dt / 0.3));
    flatPointUniforms.uDim.value = dim;
    flatPointUniforms.uHighlight.value = highlight;
    flatPointUniforms.uHover.value = view === "2d" ? hoverIndex : -1;
    fillUniforms.uHighlight.value = highlight >= 0 ? highlight : hoverField;
    fillUniforms.uDim.value = Math.max(dim, hoverField >= 0 ? 0.5 : 0);
    if (ring.visible) {
      ringAge += dt;
      const grow = easeOut(clamp01(ringAge / 0.5));
      const size = Math.max(0.4, camPos.distanceTo(camTarget) / 3.6) * (1 + 0.2 * Math.sin(clock * 3));
      ring.scale.setScalar(grow * size);
      ring.lookAt(camera.position);
      ringMat.opacity = grow * 0.9 * contentOn;
    }

    // Camera.
    if (!closing) {
      if (phase === "open") {
        const move = easeInOut(k(OPEN.CAMERA_AT, OPEN.CAMERA_TIME));
        const end = pendingFocus ? { pos: pendingFocus.pos, target: pendingFocus.target } : overview();
        camPos.lerpVectors(new THREE.Vector3(...CAM.BOOK.position), end.pos, move);
        camTarget.lerpVectors(new THREE.Vector3(...CAM.BOOK.target), end.target, move);
        if (!settled && t >= OPEN.LABELS_AT) {
          settled = true;
          opts.onSettled();
        }
        if (t >= OPEN.END) {
          phase = "idle";
          pendingFocus = null;
        }
      } else if (view === "3d" && !flight) {
        // Follow the hologram's zoom, after a short glide from where the camera was.
        const want = rig(zoom);
        if (rigBlend) {
          const p = easeInOut(clamp01((clock - rigBlend.start) / TABLET_CONFIG.switchTime));
          camPos.lerpVectors(rigBlend.pos, want.pos, p);
          camTarget.lerpVectors(rigBlend.target, want.target, p);
          if (p >= 1) rigBlend = null;
        } else {
          camPos.copy(want.pos);
          camTarget.copy(want.target);
        }
      } else if (flight) {
        const f = flight;
        const p = easeInOut(clamp01((clock - f.start) / f.time));
        camTarget.lerpVectors(f.fromTarget, f.toTarget, p);
        camPos.lerpVectors(f.fromPos, f.toPos, p);
        if (p >= 1) flight = null;
      }
      viewShift += ((insetRight - insetLeft) / 2 - viewShift) * (1 - Math.exp(-dt / 0.3));
      viewLift += ((insetBottom - insetTop) / 2 - viewLift) * (1 - Math.exp(-dt / 0.3));
    } else if (closing.style === "dive") {
      camPos.lerp(camTarget, dt * 1.2);
    }
    // Leaning follows the pointer on the flat map; in 3D the pointer turns the hologram instead.
    const leanK = phase === "idle" && pointerActive && view === "2d" && viewMix < 0.5 ? CAM.LEAN * (selected ? 0.25 : 1) : 0;
    camera.position.copy(camPos).add(new THREE.Vector3(lean.x * leanK, lean.y * leanK * 0.5, 0));
    camera.lookAt(camTarget);
    if (Math.abs(viewShift) > 0.5 || Math.abs(viewLift) > 0.5) camera.setViewOffset(viewWidth, viewHeight, viewShift, viewLift, viewWidth, viewHeight);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();

    renderer.render(scene, camera);
    hologram.render(renderer, camera, 1);
    hologram.placeLabels(camera, viewWidth, viewHeight, holoOn * labelsOn * canvasOpacity);
    if (!started) {
      stamp("first-frame");
      started = true;
      opts.onStarted();
    }
  };

  const finishClose = () => {
    const done = closing?.resolve;
    closing = null;
    done?.();
  };
  const skip = () => {
    if (phase !== "open") return;
    t = Math.max(t, OPEN.END);
  };

  applyScheme();
  placeBook(startPose, rest, opts.from ? 0 : 1, 0);
  shapeBook(opts.from ? 0 : 1);
  camera.position.copy(camPos);
  camera.lookAt(camTarget);
  for (const o of [beam, flatRise]) o.visible = true;
  try {
    await renderer.compileAsync(scene, camera);
  } catch {
    // Older drivers: compile on first use.
  }
  stamp("compiled");
  last = performance.now();
  frameId = requestAnimationFrame(renderFrame);

  // Dev and verification probe: the state, and where a term is on screen (2D).
  const probe = {
    stats: () => ({ phase, view, t: Number(t.toFixed(2)), terms: mapData.terms.length, regions: mapData.regions.length, hologram: hologram.stats(), zoom: Number(zoom.toFixed(3)), selected }),
    ids: () => (view === "2d" ? mapData.terms.map((x) => x.id) : hologram.ids()),
    screenOf: (id: string) => {
      let world: THREE.Vector3 | null = null;
      if (view === "2d") {
        const term = mapData.terms.find((x) => x.id === id);
        if (term) world = flatRise.localToWorld(new THREE.Vector3(term.x, term.y, 0));
      } else world = hologram.worldOf(id);
      if (!world) return null;
      const at = world.project(camera);
      const rect = host.getBoundingClientRect();
      return { x: rect.left + ((at.x + 1) / 2) * rect.width, y: rect.top + ((1 - at.y) / 2) * rect.height };
    },
  };
  (window as unknown as { __tablet?: typeof probe }).__tablet = probe;

  return {
    setMap(next) {
      mapData = next;
      buildFlat();
      applyScheme();
      if (selected) applyFocus();
    },
    setHologram(input) {
      hologram.set(input, renderer, camera);
    },
    setView(next) {
      if (next === view) return;
      view = next;
      hoverIndex = -1;
      hoverField = -1;
      holoHover = null;
      hologram.setHover(null);
      canvas.style.cursor = "";
      opts.onHover(null, 0, 0);
      if (view === "3d") {
        flight = null;
        rigBlend = { pos: camPos.clone(), target: camTarget.clone(), start: clock };
      } else rigBlend = null;
      applyFocus();
    },
    setAutoRotate(on) {
      hologram.setAutoRotate(on);
    },
    resetHologram() {
      hologram.reset();
    },
    setNeighbours(id, list) {
      hologram.setNeighbours(id, list);
    },
    focusTerm(id) {
      selected = id;
      applyFocus();
    },
    highlightField(id) {
      highlight = id ? indexOfField(id) : -1;
      hologram.emphasize(id);
      if (!selected) dimTarget = highlight >= 0 ? 1 : 0;
    },
    setInsets(left, right, bottom = 0, top = 0) {
      insetLeft = left;
      insetRight = right;
      insetBottom = bottom;
      insetTop = top;
    },
    setScheme(nextDark, nextColors) {
      dark = nextDark;
      colors = nextColors;
      applyScheme();
      buildFlat();
    },
    skip,
    close(to, style) {
      return new Promise<void>((resolve) => {
        if (closing) return resolve();
        phase = "closing";
        t = Math.max(t, OPEN.END);
        opts.onHover(null, 0, 0);
        closeT = 0;
        closing = { style, to: to ? poseOnRect(to) : null, resolve, fromPos: camPos.clone(), fromTarget: camTarget.clone(), startShift: viewShift };
        if (style === "fly") {
          selected = null;
          ring.visible = false;
          dimTarget = 0;
        }
      });
    },
    dispose() {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      for (const sprite of labels.children as THREE.Sprite[]) {
        sprite.material.map?.dispose();
        sprite.material.dispose();
      }
      fill.geometry.dispose();
      flatPoints.geometry.dispose();
      hologram.dispose();
      for (const d of disposables) d.dispose();
      renderer.dispose();
      canvas.remove();
      const w = window as unknown as { __tablet?: unknown };
      if (w.__tablet === probe) delete w.__tablet;
    },
  };
}
