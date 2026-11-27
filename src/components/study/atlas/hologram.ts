import * as THREE from "three";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { ATLAS_CONFIG } from "@/lib/study/atlas/config";
import { countryAt, focusFrame, MAP_HEIGHT, project, unproject, type AtlasData } from "@/lib/study/atlas/geo";
import type { AtlasMesh } from "./atlas-mesh";

/**
 * The Bahasa book, opened: a three.js scene over the Perpustakaan.
 *
 * The book starts exactly where its sheet rested on the shelf, facing the
 * camera with the sheet's own face as its cover, so the sheet seems to lift
 * off and become a book. It lays itself down while the library's fog closes
 * behind it, the cover swings open on its spine, loose pages turn, a beam of
 * light rises from the spread and the world map assembles in it, bottom to
 * top. Countries with words light up in their language's colour, west to
 * east. Then the camera settles on the whole map and leans with the pointer.
 *
 * Picking a country flies the camera to its main land (focus box from the
 * build script) while the rest dims and a pin rises from its label point.
 * Closing plays it backwards: the map sinks into the pages, the cover shuts,
 * and the book flies back onto its sheet as the fog clears.
 *
 * The canvas is transparent: the page behind it is the `backdrop`, an
 * element in the library's fog colour whose opacity this drives, so the
 * library shows around the book until the fog has closed. Numbers live in
 * lib/study/atlas/config.ts.
 */

export type HologramColors = {
  /** The hologram's light (--holo). */
  holo: string;
  /** The fog the library is drawn in, behind everything. */
  fog: string;
  paper: string;
  ink: string;
  /** The cover's deep tone, for the back and the spine. */
  deep: string;
};

export type HologramOptions = {
  host: HTMLElement;
  backdrop: HTMLElement;
  data: AtlasData;
  /** Built ahead of time (atlas-load.ts). */
  mesh: AtlasMesh;
  /** The Bahasa sheet's face (the card as the world draws it), and its proportions. */
  cover: HTMLCanvasElement;
  aspect: number;
  /** Where the sheet rests on the shelf; null on a direct visit (the book appears in the middle). */
  from: DOMRect | null;
  colors: HologramColors;
  dark: boolean;
  onHover: (code: string | null, x: number, y: number) => void;
  onPick: (code: string | null) => void;
  /** The first frame is drawn: the book now stands where the sheet was (the sheet can hide). */
  onStarted: () => void;
  /** The fog fully covers the library (it can stop drawing). */
  onCovered: () => void;
  /** The opening has finished (the UI around it can show). */
  onSettled: () => void;
};

export type Hologram = {
  /** Lit countries: alpha-2 → CSS colour. */
  setLit(lit: ReadonlyMap<string, string>): void;
  /** Lifts these countries (a language under the pointer in the legend); null clears. */
  highlight(codes: ReadonlySet<string> | null): void;
  focus(code: string | null): void;
  /** Space taken by the UI on each side (px): the picture centres in what is left. */
  setInsets(left: number, right: number, bottom?: number, top?: number): void;
  setScheme(dark: boolean, colors: HologramColors): void;
  /** Jumps the opening to its end. */
  skip(): void;
  /** Plays the closing; `to` is where the sheet will rest again (null: it fades where it is). */
  close(to: DOMRect | null): Promise<void>;
  dispose(): void;
};

const { map: MAP, book: BOOK, camera: CAM, open: OPEN, close: CLOSE, holo: HOLO } = ATLAS_CONFIG;

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const span = (t: number, start: number, length: number) => clamp01((t - start) / length);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeIn = (t: number) => t * t * t;

function rgb(css: string): THREE.Color {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(css);
  return m ? new THREE.Color(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255) : new THREE.Color(0.5, 0.8, 0.9);
}

// ------------------------------------------------------------------ shaders

const FILL_VERTEX = /* glsl */ `
  attribute float aCountry;
  varying float vCountry;
  varying vec2 vMap;
  uniform vec2 uSize;
  void main() {
    vCountry = aCountry;
    vMap = position.xy / uSize + 0.5;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FILL_FRAGMENT = /* glsl */ `
  uniform sampler2D uStates;
  uniform sampler2D uFlags;
  uniform float uCount;
  uniform float uTime;
  uniform float uReveal;
  uniform float uHover;
  uniform float uSelected;
  uniform float uDim;
  uniform vec3 uBase;
  uniform float uAlpha;
  uniform vec3 uLevels;   // base, lit, hover
  uniform float uScan;
  uniform float uScanSpeed;
  uniform float uFlicker;
  varying float vCountry;
  varying vec2 vMap;
  void main() {
    // Assembling: nothing above the sweep, a bright edge on it.
    float edge = vMap.y - uReveal;
    if (edge > 0.0) discard;
    vec2 cell = vec2((vCountry + 0.5) / uCount, 0.5);
    vec4 state = texture2D(uStates, cell);
    float flag = texture2D(uFlags, cell).r;
    float lit = state.a;
    float hover = 1.0 - step(0.5, abs(vCountry - uHover));
    float selected = 1.0 - step(0.5, abs(vCountry - uSelected));
    vec3 colour = mix(uBase, state.rgb, lit);
    float alpha = uLevels.x + (uLevels.y - uLevels.x) * lit + uLevels.z * max(max(hover, flag), selected);
    // Scan lines drifting up, and a slow band of light sweeping down.
    float lines = 0.72 + 0.28 * sin((vMap.y * uScan - uTime * 2.4) * 6.2831);
    float band = smoothstep(0.1, 0.0, abs(fract(vMap.y + uTime * uScanSpeed) - 0.5));
    alpha *= lines + band * 0.7;
    alpha *= 1.0 - uFlicker + uFlicker * sin(uTime * 37.0 + vCountry * 1.7);
    alpha *= mix(1.0, ${HOLO.DIM.toFixed(2)}, uDim * (1.0 - selected));
    alpha += smoothstep(-0.025, 0.0, edge) * 0.6;
    gl_FragColor = vec4(colour * (1.0 + 0.25 * hover), alpha * uAlpha);
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

const DUST_VERTEX = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uPixel;
  uniform vec3 uLow;
  uniform vec3 uHigh;
  varying float vAlpha;
  void main() {
    float rise = fract(aSeed * 7.13 + uTime * (0.035 + 0.04 * fract(aSeed * 3.7)));
    // Across the beam (x scaled by its half-width), up it, and through its depth; narrow at the pages.
    vec3 p = vec3(position.x * uHigh.x, mix(uLow.y, uHigh.y, rise), mix(uLow.z, uHigh.z, position.z));
    p.x *= mix(0.35, 1.0, rise);
    p.x += sin(uTime * 0.6 + aSeed * 40.0) * 0.06;
    vAlpha = sin(rise * 3.14159) * (0.4 + 0.6 * fract(aSeed * 11.0));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uPixel * (1.5 + 2.5 * fract(aSeed * 5.3)) * (6.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const DUST_FRAGMENT = /* glsl */ `
  uniform vec3 uColour;
  uniform float uIntensity;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    gl_FragColor = vec4(uColour, smoothstep(0.5, 0.0, d) * vAlpha * uIntensity);
  }
`;

const PAGE_VERTEX = /* glsl */ `
  uniform float uBend;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    // Lifted pages curve away from the spine (x = 0) as they turn.
    float u = clamp(p.x / ${(BOOK.HEIGHT * BOOK.ASPECT).toFixed(3)}, 0.0, 1.0);
    p.z += uBend * u * u;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const PAGE_FRAGMENT = /* glsl */ `
  uniform vec3 uPaper;
  uniform float uShade;
  varying vec2 vUv;
  void main() {
    float edge = smoothstep(0.0, 0.08, vUv.x) * 0.06 + 0.94;
    gl_FragColor = vec4(uPaper * uShade * edge, 1.0);
  }
`;

// ------------------------------------------------------------------ textures

/** The open spread: paper, the world printed in ink, a gutter shadow. Left half and right half. */
function drawSpread(data: AtlasData, colors: HologramColors, aspect: number): HTMLCanvasElement {
  const h = 768;
  const w = Math.round(h * aspect * 2);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.fillStyle = colors.paper;
  ctx.fillRect(0, 0, w, h);
  // The printed map, centred across both pages.
  const mapW = w * 0.82;
  const mapH = (mapW * (MAP.LAT_TOP - MAP.LAT_BOTTOM)) / 360;
  const ox = (w - mapW) / 2;
  const oy = (h - mapH) / 2;
  const px = (lon: number) => ox + ((lon + 180) / 360) * mapW;
  const py = (lat: number) => oy + ((MAP.LAT_TOP - lat) / (MAP.LAT_TOP - MAP.LAT_BOTTOM)) * mapH;
  ctx.globalAlpha = 0.09;
  ctx.fillStyle = colors.ink;
  ctx.strokeStyle = colors.ink;
  ctx.lineWidth = 1.2;
  for (const country of data.countries) {
    ctx.beginPath();
    for (const polygon of country.polygons) {
      for (const ring of polygon) {
        for (let i = 0; i < ring.length; i += 2) {
          if (i === 0) ctx.moveTo(px(ring[i]), py(ring[i + 1]));
          else ctx.lineTo(px(ring[i]), py(ring[i + 1]));
        }
        ctx.closePath();
      }
    }
    ctx.fill("evenodd");
  }
  ctx.globalAlpha = 0.16;
  for (let lon = -180; lon <= 180; lon += MAP.GRATICULE * 2) {
    ctx.beginPath();
    ctx.moveTo(px(lon), py(MAP.LAT_TOP));
    ctx.lineTo(px(lon), py(MAP.LAT_BOTTOM));
    ctx.stroke();
  }
  for (let lat = -45; lat <= 75; lat += MAP.GRATICULE * 2) {
    ctx.beginPath();
    ctx.moveTo(px(-180), py(lat));
    ctx.lineTo(px(180), py(lat));
    ctx.stroke();
  }
  // Running heads and folios.
  ctx.globalAlpha = 0.35;
  ctx.font = `600 ${Math.round(h * 0.03)}px sans-serif`;
  ctx.textBaseline = "top";
  ctx.fillText("BAHASA", w * 0.06, h * 0.06);
  ctx.textAlign = "right";
  ctx.fillText("ATLAS DIKSI", w * 0.94, h * 0.06);
  ctx.globalAlpha = 1;
  // The gutter.
  const gutter = ctx.createLinearGradient(w / 2 - w * 0.06, 0, w / 2 + w * 0.06, 0);
  gutter.addColorStop(0, "rgba(0,0,0,0)");
  gutter.addColorStop(0.5, "rgba(0,0,0,0.16)");
  gutter.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gutter;
  ctx.fillRect(w / 2 - w * 0.06, 0, w * 0.12, h);
  return canvas;
}

/** Page edges: fine paper lines. */
function drawEdges(colors: HologramColors): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 64;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.fillStyle = colors.paper;
  ctx.fillRect(0, 0, 8, 64);
  ctx.fillStyle = colors.ink;
  for (let y = 1; y < 64; y += 3) {
    ctx.globalAlpha = 0.05 + 0.05 * ((y * 7) % 3);
    ctx.fillRect(0, y, 8, 1);
  }
  return canvas;
}

function texture(canvas: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.NoColorSpace; // shown as written, like the library
  t.anisotropy = 4;
  return t;
}

// ------------------------------------------------------------------ the scene

export async function createHologram(opts: HologramOptions): Promise<Hologram> {
  const stamp = (name: string) => performance.mark(`atlas:${name}`);
  stamp("create");
  const { host, backdrop, data } = opts;
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

  // ---------------------------------------------------------------- book
  const H = BOOK.HEIGHT;
  const W = H * opts.aspect;
  const T = BOOK.THICKNESS;
  const C = BOOK.COVER;
  const block = (T - 2 * C) / 2; // each half of the page block
  const restScale = Math.min(1, (MAP.WIDTH * BOOK.SPREAD) / (2 * W));
  const paper = rgb(colors.paper);
  const deep = rgb(colors.deep);

  const book = new THREE.Group();
  scene.add(book);
  stamp("renderer");
  const spreadTex = keep(texture(drawSpread(data, colors, opts.aspect)));
  stamp("spread");
  const rightTex = spreadTex.clone();
  rightTex.repeat.set(0.5, 1);
  rightTex.offset.set(0.5, 0);
  rightTex.needsUpdate = true;
  const leftTex = spreadTex.clone();
  leftTex.repeat.set(0.5, 1);
  leftTex.offset.set(0, 0);
  leftTex.center.set(0.25, 0.5);
  leftTex.rotation = Math.PI; // the left page lies upside down until the cover turns it over
  leftTex.needsUpdate = true;
  keep(rightTex);
  keep(leftTex);
  const edgeTex = keep(texture(drawEdges(colors)));
  edgeTex.wrapS = edgeTex.wrapT = THREE.RepeatWrapping;
  edgeTex.repeat.set(1, 3);
  const coverTex = keep(texture(opts.cover));

  const shade = (c: THREE.Color, k: number) => c.clone().multiplyScalar(k);
  const edgeMat = keep(new THREE.MeshBasicMaterial({ map: edgeTex, color: shade(new THREE.Color(1, 1, 1), 0.92) }));
  const deepMat = keep(new THREE.MeshBasicMaterial({ color: deep }));
  const deepSideMat = keep(new THREE.MeshBasicMaterial({ color: shade(deep, 0.78) }));
  const coverMat = keep(new THREE.MeshBasicMaterial({ map: coverTex }));
  const paperMat = keep(new THREE.MeshBasicMaterial({ color: paper }));

  // Back cover and the right half of the pages.
  const back = new THREE.Mesh(keep(new THREE.BoxGeometry(W, C, H)), [deepSideMat, deepSideMat, deepMat, deepMat, deepSideMat, deepSideMat]);
  back.position.set(0, C / 2, 0);
  book.add(back);
  const rightBlock = new THREE.Mesh(keep(new THREE.BoxGeometry(W * 0.97, block, H * 0.96)), [edgeMat, edgeMat, paperMat, paperMat, edgeMat, edgeMat]);
  rightBlock.position.set(W * 0.015, C + block / 2, 0);
  book.add(rightBlock);
  const rightPage = new THREE.Mesh(keep(new THREE.PlaneGeometry(W * 0.97, H * 0.96)), keep(new THREE.MeshBasicMaterial({ map: rightTex })));
  rightPage.rotation.x = -Math.PI / 2;
  rightPage.position.set(W * 0.015, C + block + 0.002, 0);
  book.add(rightPage);

  // The front cover and the left half of the pages turn together on the spine.
  const hinge = new THREE.Group();
  hinge.position.set(-W / 2, T / 2, 0);
  book.add(hinge);
  const front = new THREE.Mesh(keep(new THREE.BoxGeometry(W, C, H)), [deepSideMat, deepSideMat, coverMat, deepMat, deepSideMat, deepSideMat]);
  front.position.set(W / 2, T / 2 - C / 2, 0);
  hinge.add(front);
  const leftBlock = new THREE.Mesh(keep(new THREE.BoxGeometry(W * 0.97, block, H * 0.96)), [edgeMat, edgeMat, paperMat, paperMat, edgeMat, edgeMat]);
  leftBlock.position.set(W / 2 + W * 0.015, T / 2 - C - block / 2, 0);
  hinge.add(leftBlock);
  const leftPage = new THREE.Mesh(keep(new THREE.PlaneGeometry(W * 0.97, H * 0.96)), keep(new THREE.MeshBasicMaterial({ map: leftTex })));
  leftPage.rotation.x = Math.PI / 2;
  leftPage.position.set(W / 2 + W * 0.015, T / 2 - C - block - 0.002, 0);
  hinge.add(leftPage);

  // Loose pages: they turn after the cover, each bending as it goes.
  const flutter: { pivot: THREE.Group; uniforms: { uBend: { value: number }; uPaper: { value: THREE.Color }; uShade: { value: number } } }[] = [];
  const pageGeometry = keep(new THREE.PlaneGeometry(W * 0.96, H * 0.95, 16, 1));
  pageGeometry.translate((W * 0.96) / 2, 0, 0);
  pageGeometry.rotateX(-Math.PI / 2);
  for (let i = 0; i < BOOK.FLUTTER_PAGES; i++) {
    const uniforms = { uBend: { value: 0 }, uPaper: { value: paper.clone() }, uShade: { value: 1 } };
    const material = keep(new THREE.ShaderMaterial({ vertexShader: PAGE_VERTEX, fragmentShader: PAGE_FRAGMENT, uniforms, side: THREE.DoubleSide }));
    const pivot = new THREE.Group();
    pivot.position.set(-W / 2, C + block + 0.004 + i * 0.0015, 0);
    const mesh = new THREE.Mesh(pageGeometry, material);
    mesh.position.y = -0.0015;
    pivot.add(mesh);
    pivot.visible = false;
    book.add(pivot);
    flutter.push({ pivot, uniforms });
  }

  // A soft shadow under the book.
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
  const shadow = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(1, 1)),
    keep(new THREE.MeshBasicMaterial({ map: keep(texture(shadowCanvas)), transparent: true, depthWrite: false })),
  );
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);

  // ---------------------------------------------------------------- the map
  const mapGroup = new THREE.Group();
  mapGroup.position.set(MAP.CENTER[0], MAP.CENTER[1], MAP.CENTER[2]);
  mapGroup.rotation.x = MAP.TILT;
  scene.add(mapGroup);
  const mapRise = new THREE.Group(); // grows out of the pages
  mapGroup.add(mapRise);

  stamp("book");
  const count = data.countries.length;
  const indexOf = new Map(data.countries.map((c, i) => [c.code, i]));
  const { segmentCountry } = opts.mesh;
  const fillGeometry = keep(new THREE.BufferGeometry());
  fillGeometry.setAttribute("position", new THREE.BufferAttribute(opts.mesh.fill, 3));
  fillGeometry.setAttribute("aCountry", new THREE.BufferAttribute(opts.mesh.fillCountry, 1));

  const states = new Uint8Array(count * 4);
  const flags = new Uint8Array(count * 4);
  const statesTex = keep(new THREE.DataTexture(states, count, 1, THREE.RGBAFormat));
  const flagsTex = keep(new THREE.DataTexture(flags, count, 1, THREE.RGBAFormat));
  for (const t of [statesTex, flagsTex]) {
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.needsUpdate = true;
  }
  const fillUniforms = {
    uStates: { value: statesTex },
    uFlags: { value: flagsTex },
    uCount: { value: count },
    uTime: { value: 0 },
    uReveal: { value: -0.05 },
    uHover: { value: -1 },
    uSelected: { value: -1 },
    uDim: { value: 0 },
    uBase: { value: holo.clone() },
    uAlpha: { value: 1 },
    uLevels: { value: new THREE.Vector3(HOLO.FILL, HOLO.FILL_LIT, HOLO.FILL_HOVER) },
    uScan: { value: HOLO.SCAN_LINES },
    uScanSpeed: { value: HOLO.SCAN_SPEED },
    uFlicker: { value: HOLO.FLICKER },
    uSize: { value: new THREE.Vector2(MAP.WIDTH, MAP_HEIGHT) },
  };
  const fillMaterial = keep(
    new THREE.ShaderMaterial({
      vertexShader: FILL_VERTEX,
      fragmentShader: FILL_FRAGMENT,
      uniforms: fillUniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  const fill = new THREE.Mesh(fillGeometry, fillMaterial);
  fill.renderOrder = 2;
  mapRise.add(fill);

  // Borders: crisp, a few pixels wide; lit countries take their colour.
  const lineGeometry = keep(new LineSegmentsGeometry());
  lineGeometry.setPositions(opts.mesh.segments);
  const segmentColours = new Float32Array(segmentCountry.length * 6);
  const lineMaterial = keep(
    new LineMaterial({ color: 0xffffff, vertexColors: true, linewidth: HOLO.LINE_WIDTH, transparent: true, opacity: 0, depthWrite: false }),
  );
  const lines = new LineSegments2(lineGeometry, lineMaterial);
  lines.renderOrder = 3;
  mapRise.add(lines);

  // The hovered and the selected country, drawn again on top, thicker.
  const markMaterial = keep(new LineMaterial({ color: 0xffffff, linewidth: HOLO.LINE_WIDTH_FOCUS, transparent: true, opacity: 0.95, depthWrite: false }));
  const markGeometry = keep(new LineSegmentsGeometry());
  const mark = new LineSegments2(markGeometry, markMaterial);
  mark.renderOrder = 4;
  mark.visible = false;
  mapRise.add(mark);

  // Graticule and a frame with corner brackets.
  const grid: number[] = [];
  for (let lon = -180; lon <= 180; lon += MAP.GRATICULE) {
    const [x, y0] = project(lon, MAP.LAT_BOTTOM);
    const [, y1] = project(lon, MAP.LAT_TOP);
    grid.push(x, y0, -0.002, x, y1, -0.002);
  }
  for (let lat = -45; lat <= 75; lat += MAP.GRATICULE) {
    const [x0, y] = project(-180, lat);
    const [x1] = project(180, lat);
    grid.push(x0, y, -0.002, x1, y, -0.002);
  }
  const gridGeometry = keep(new THREE.BufferGeometry());
  gridGeometry.setAttribute("position", new THREE.Float32BufferAttribute(grid, 3));
  const gridMaterial = keep(new THREE.LineBasicMaterial({ color: holo.clone(), transparent: true, opacity: 0, depthWrite: false }));
  const graticule = new THREE.LineSegments(gridGeometry, gridMaterial);
  mapRise.add(graticule);

  const hw = MAP.WIDTH / 2 + 0.12;
  const hh = MAP_HEIGHT / 2 + 0.12;
  const b = 0.32;
  const frameSegs = [
    [-hw, hh - b, -hw, hh], [-hw, hh, -hw + b, hh], [hw - b, hh, hw, hh], [hw, hh, hw, hh - b],
    [hw, -hh + b, hw, -hh], [hw, -hh, hw - b, -hh], [-hw + b, -hh, -hw, -hh], [-hw, -hh, -hw, -hh + b],
  ].flatMap(([x0, y0, x1, y1]) => [x0, y0, 0, x1, y1, 0]);
  for (let lon = -180; lon <= 180; lon += 30) {
    const [x] = project(lon, 0);
    frameSegs.push(x, -hh, 0, x, -hh + 0.05, 0, x, hh, 0, x, hh - 0.05, 0);
  }
  const frameGeometry = keep(new LineSegmentsGeometry());
  frameGeometry.setPositions(frameSegs);
  const frameMaterial = keep(new LineMaterial({ color: holo.clone(), linewidth: 1.6, transparent: true, opacity: 0, depthWrite: false }));
  const frame = new LineSegments2(frameGeometry, frameMaterial);
  mapRise.add(frame);

  // The pin on a focused country: a ring and a needle of light.
  const pin = new THREE.Group();
  const ringMaterial = keep(new THREE.MeshBasicMaterial({ color: holo.clone(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  const ring = new THREE.Mesh(keep(new THREE.RingGeometry(0.03, 0.042, 48)), ringMaterial);
  ring.position.z = 0.004;
  pin.add(ring);
  const dotMaterial = keep(new THREE.MeshBasicMaterial({ color: holo.clone(), transparent: true, opacity: 0, depthWrite: false }));
  const dot = new THREE.Mesh(keep(new THREE.CircleGeometry(0.012, 24)), dotMaterial);
  dot.position.z = 0.005;
  pin.add(dot);
  pin.visible = false;
  mapRise.add(pin);

  stamp("map");
  // ---------------------------------------------------------------- beam and dust
  const restTop = new THREE.Vector3(BOOK.REST[0], BOOK.REST[1] + T * restScale, BOOK.REST[2]);
  const topCorners = [
    [-MAP.WIDTH / 2, -MAP_HEIGHT / 2],
    [MAP.WIDTH / 2, -MAP_HEIGHT / 2],
    [MAP.WIDTH / 2, MAP_HEIGHT / 2],
    [-MAP.WIDTH / 2, MAP_HEIGHT / 2],
  ].map(([x, y]) => {
    const v = new THREE.Vector3(x * 0.98, y * 0.98, 0);
    v.applyEuler(new THREE.Euler(MAP.TILT, 0, 0));
    return v.add(new THREE.Vector3(...MAP.CENTER));
  });
  const baseCorners = [
    [-W * 0.42, H * 0.3],
    [W * 0.42, H * 0.3],
    [W * 0.42, -H * 0.3],
    [-W * 0.42, -H * 0.3],
  ].map(([x, z]) => [x * restScale, z * restScale]).map(([x, z]) => new THREE.Vector3(restTop.x + x, restTop.y + 0.01, restTop.z + z));
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
  const beamMaterial = keep(
    new THREE.ShaderMaterial({ vertexShader: BEAM_VERTEX, fragmentShader: BEAM_FRAGMENT, uniforms: beamUniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
  );
  const beam = new THREE.Mesh(beamGeometry, beamMaterial);
  beam.renderOrder = 1;
  scene.add(beam);

  const dustSeeds = new Float32Array(HOLO.DUST);
  const dustPos = new Float32Array(HOLO.DUST * 3);
  for (let i = 0; i < HOLO.DUST; i++) {
    dustSeeds[i] = Math.random();
    dustPos[i * 3] = Math.random() * 2 - 1;
    dustPos[i * 3 + 1] = 0;
    dustPos[i * 3 + 2] = Math.random();
  }
  const dustGeometry = keep(new THREE.BufferGeometry());
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  dustGeometry.setAttribute("aSeed", new THREE.BufferAttribute(dustSeeds, 1));
  const dustUniforms = {
    uTime: { value: 0 },
    uPixel: { value: pixelRatio },
    uLow: { value: new THREE.Vector3(0, restTop.y, restTop.z - H * 0.3 * restScale) },
    uHigh: { value: new THREE.Vector3(MAP.WIDTH * 0.48, MAP.CENTER[1] + MAP_HEIGHT * 0.45, restTop.z + H * 0.3 * restScale) },
    uColour: { value: holo.clone() },
    uIntensity: { value: 0 },
  };
  const dustMaterial = keep(
    new THREE.ShaderMaterial({ vertexShader: DUST_VERTEX, fragmentShader: DUST_FRAGMENT, uniforms: dustUniforms, transparent: true, depthWrite: false }),
  );
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  scene.add(dust);

  // ---------------------------------------------------------------- scheme
  const applyScheme = () => {
    const c = rgb(colors.holo);
    holo.copy(c);
    const blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    for (const m of [fillMaterial, lineMaterial, markMaterial, gridMaterial, frameMaterial, ringMaterial, dotMaterial, beamMaterial, dustMaterial]) {
      m.blending = blending;
      m.needsUpdate = true;
    }
    fillUniforms.uBase.value.copy(c);
    fillUniforms.uAlpha.value = dark ? 1 : HOLO.LIGHT_ALPHA;
    beamUniforms.uColour.value.copy(c);
    dustUniforms.uColour.value.copy(c);
    gridMaterial.color.copy(c);
    frameMaterial.color.copy(c);
    backdrop.style.backgroundColor = colors.fog;
    paintLines();
  };

  // ---------------------------------------------------------------- lit countries
  const litColour = new Map<number, THREE.Color>();
  const litOrder: { index: number; at: number }[] = [];
  let lightsOn = false;
  const paintLines = () => {
    for (let s = 0; s < segmentCountry.length; s++) {
      const lit = lightsOn ? litColour.get(segmentCountry[s]) : undefined;
      const c = lit ?? holo;
      const k = lit ? 1 : dark ? 0.75 : 0.85;
      for (let e = 0; e < 2; e++) {
        segmentColours[s * 6 + e * 3] = c.r * k;
        segmentColours[s * 6 + e * 3 + 1] = c.g * k;
        segmentColours[s * 6 + e * 3 + 2] = c.b * k;
      }
    }
    lineGeometry.setColors(segmentColours);
  };
  const setLit = (lit: ReadonlyMap<string, string>) => {
    litColour.clear();
    litOrder.length = 0;
    for (const [code, css] of lit) {
      const index = indexOf.get(code);
      if (index === undefined) continue;
      const colour = rgb(css);
      litColour.set(index, colour);
      const country = data.countries[index];
      litOrder.push({ index, at: OPEN.LIGHT_AT + ((country.label[0] + 180) / 360) * OPEN.LIGHT_SPREAD });
      states[index * 4] = Math.round(colour.r * 255);
      states[index * 4 + 1] = Math.round(colour.g * 255);
      states[index * 4 + 2] = Math.round(colour.b * 255);
    }
    for (let i = 0; i < count; i++) if (!litColour.has(i)) states[i * 4 + 3] = 0;
    if (lightsOn) for (const i of litColour.keys()) states[i * 4 + 3] = 255;
    statesTex.needsUpdate = true;
    paintLines();
  };

  // ---------------------------------------------------------------- camera
  const camPos = new THREE.Vector3(...CAM.BOOK.position);
  const camTarget = new THREE.Vector3(...CAM.BOOK.target);
  type Flight = { fromPos: THREE.Vector3; fromTarget: THREE.Vector3; toPos: THREE.Vector3; toTarget: THREE.Vector3; start: number; time: number; arc: number };
  let flight: Flight | null = null;
  const flyTo = (pos: THREE.Vector3, target: THREE.Vector3, time: number) => {
    const arc = CAM.FOCUS_ARC * camTarget.distanceTo(target);
    flight = { fromPos: camPos.clone(), fromTarget: camTarget.clone(), toPos: pos.clone(), toTarget: target.clone(), start: clock, time, arc };
  };
  /** The whole map, pulled back on narrow (portrait) screens until its width fits. */
  const overview = () => {
    const target = new THREE.Vector3(...CAM.OVERVIEW.target);
    const pos = new THREE.Vector3(...CAM.OVERVIEW.position);
    const tanH = Math.tan(THREE.MathUtils.degToRad(CAM.FOV / 2)) * (viewWidth / viewHeight) * Math.max(0.4, 1 - (insetLeft + insetRight) / viewWidth);
    const fit = (MAP.WIDTH * 0.56) / tanH;
    const away = pos.clone().sub(target);
    if (fit > away.length()) pos.copy(target).addScaledVector(away.normalize(), fit);
    return { pos, target };
  };

  let viewWidth = 1;
  let viewHeight = 1;
  let insetLeft = 0;
  let insetRight = 0;
  let insetBottom = 0;
  let insetTop = 0;
  let viewShift = 0;
  let viewLift = 0;
  const resize = () => {
    viewWidth = Math.max(1, host.clientWidth);
    viewHeight = Math.max(1, host.clientHeight);
    renderer.setSize(viewWidth, viewHeight, false);
    camera.aspect = viewWidth / viewHeight;
    camera.updateProjectionMatrix();
    for (const m of [lineMaterial, markMaterial, frameMaterial]) m.resolution.set(viewWidth * pixelRatio, viewHeight * pixelRatio);
  };
  resize();
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);

  // ---------------------------------------------------------------- the book's poses
  /** The book standing on its sheet's rect, facing the camera at its BOOK pose. */
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
    // Book axes: X along the sheet's width, +Y (the cover's face) toward the camera, -Z up the screen.
    const basis = new THREE.Matrix4().makeBasis(right, backward, up.clone().negate());
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(basis);
    const position = coverCentre.clone().addScaledVector(backward, -T);
    return { position, quaternion };
  };
  const restPose = { position: new THREE.Vector3(...BOOK.REST), quaternion: new THREE.Quaternion() };
  const rest = { ...restPose, scale: restScale };
  const startPose = opts.from
    ? { ...poseOnRect(opts.from), scale: 1 }
    : { position: restPose.position.clone().add(new THREE.Vector3(0, 0.9, 0.6)), quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.9, 0, 0)), scale: restScale };
  /** Between two poses; `k` 0 is `from`. The book shrinks toward its resting size as it lands. */
  const placeBook = (from: { position: THREE.Vector3; quaternion: THREE.Quaternion; scale: number }, to: typeof from, k: number, arc: number) => {
    book.position.lerpVectors(from.position, to.position, k);
    book.position.y += Math.sin(Math.PI * k) * arc;
    book.quaternion.slerpQuaternions(from.quaternion, to.quaternion, k);
    book.scale.setScalar(from.scale + (to.scale - from.scale) * k);
  };

  // ---------------------------------------------------------------- input
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerActive = false;
  let hoverIndex = -1;
  let selectedIndex = -1;
  const lean = new THREE.Vector2();
  const plane = new THREE.Plane();
  const hit = new THREE.Vector3();
  const pick = (clientX: number, clientY: number): number => {
    const rect = host.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
    raycaster.setFromCamera(pointer, camera);
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(mapRise.getWorldQuaternion(new THREE.Quaternion()));
    plane.setFromNormalAndCoplanarPoint(normal, mapRise.getWorldPosition(new THREE.Vector3()));
    if (!raycaster.ray.intersectPlane(plane, hit)) return -1;
    const local = mapRise.worldToLocal(hit.clone());
    if (Math.abs(local.x) > MAP.WIDTH / 2 || Math.abs(local.y) > MAP_HEIGHT / 2) return -1;
    const [lon, lat] = unproject(local.x, local.y);
    const country = countryAt(data, lon, lat);
    return country ? (indexOf.get(country.code) ?? -1) : -1;
  };
  let phase: "open" | "idle" | "closing" = "open";
  const onMove = (e: PointerEvent) => {
    pointerActive = e.pointerType === "mouse";
    const rect = host.getBoundingClientRect();
    lean.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -(((e.clientY - rect.top) / rect.height) * 2 - 1));
    if (phase !== "idle" || e.pointerType !== "mouse") return;
    const index = pick(e.clientX, e.clientY);
    if (index !== hoverIndex) {
      hoverIndex = index;
      setMark();
      canvas.style.cursor = index >= 0 ? "pointer" : "";
    }
    opts.onHover(index >= 0 ? data.countries[index].code : null, e.clientX, e.clientY);
  };
  const onLeave = () => {
    hoverIndex = -1;
    setMark();
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
    const index = pick(e.clientX, e.clientY);
    opts.onPick(index >= 0 ? data.countries[index].code : null);
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

  /** The thick outline over the hovered or the selected country. */
  const setMark = () => {
    const index = selectedIndex >= 0 ? selectedIndex : hoverIndex;
    fillUniforms.uHover.value = hoverIndex;
    if (index < 0) {
      mark.visible = false;
      return;
    }
    const segs: number[] = [];
    for (const polygon of data.countries[index].polygons) {
      for (const r of polygon) {
        for (let i = 0; i < r.length; i += 2) {
          const j = (i + 2) % r.length;
          const [x0, y0] = project(r[i], r[i + 1]);
          const [x1, y1] = project(r[j], r[j + 1]);
          segs.push(x0, y0, 0.003, x1, y1, 0.003);
        }
      }
    }
    markGeometry.setPositions(segs);
    markMaterial.color.copy(litColour.get(index) ?? holo);
    markMaterial.linewidth = index === selectedIndex ? HOLO.LINE_WIDTH_FOCUS : HOLO.LINE_WIDTH_FOCUS * 0.75;
    mark.visible = true;
  };

  // ---------------------------------------------------------------- focus
  let dim = 0;
  let dimTarget = 0;
  let pinAge = 0;
  const focus = (code: string | null) => {
    const index = code ? (indexOf.get(code) ?? -1) : -1;
    selectedIndex = index;
    fillUniforms.uSelected.value = index;
    setMark();
    if (index < 0) {
      dimTarget = 0;
      pin.visible = false;
      if (phase === "idle") {
        const o = overview();
        flyTo(o.pos, o.target, CAM.FOCUS_TIME);
      }
      return;
    }
    const country = data.countries[index];
    const frameBox = focusFrame(country);
    const [cx, cy] = project(frameBox.lon, frameBox.lat);
    const target = mapRise.localToWorld(new THREE.Vector3(cx, cy, 0));
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(mapRise.getWorldQuaternion(new THREE.Quaternion()));
    const tanV = Math.tan(THREE.MathUtils.degToRad(CAM.FOV / 2));
    const usable = Math.max(0.35, 1 - ((insetLeft + insetRight) * 1.1) / viewWidth);
    const usableV = Math.max(0.3, 1 - ((insetBottom + insetTop) * 1.1) / viewHeight);
    const tanH = tanV * camera.aspect * usable;
    const tanVu = tanV * usableV;
    const w = frameBox.width * (MAP.WIDTH / 360);
    const h = frameBox.height * (MAP.WIDTH / 360);
    const distance = Math.min(
      new THREE.Vector3(...CAM.OVERVIEW.position).distanceTo(new THREE.Vector3(...CAM.OVERVIEW.target)),
      Math.max(CAM.FOCUS_MIN_DISTANCE, w / (2 * tanH * CAM.FOCUS_FILL), h / (2 * tanVu * CAM.FOCUS_FILL)),
    );
    const position = target.clone().addScaledVector(normal, distance).add(new THREE.Vector3(0, distance * 0.14, 0));
    dimTarget = 1;
    const [lx, ly] = project(country.label[0], country.label[1]);
    pin.position.set(lx, ly, 0);
    pin.visible = true;
    pinAge = 0;
    const tint = litColour.get(index) ?? holo;
    ringMaterial.color.copy(tint);
    dotMaterial.color.copy(tint);
    if (phase === "idle") flyTo(position, target, CAM.FOCUS_TIME);
    else pendingFocus = { position, target };
  };
  let pendingFocus: { position: THREE.Vector3; target: THREE.Vector3 } | null = null;

  // ---------------------------------------------------------------- the loop
  let clock = 0;
  let t = 0; // timeline of the opening (s)
  let closeT = 0;
  type Pose = { position: THREE.Vector3; quaternion: THREE.Quaternion; scale: number };
  let closing: { to: Pose | null; from: Pose; resolve: () => void; fromPos: THREE.Vector3; fromTarget: THREE.Vector3; startShift: number } | null = null;
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
    fillUniforms.uTime.value = clock;
    beamUniforms.uTime.value = clock;
    dustUniforms.uTime.value = clock;

    if (phase === "open") t += dt;
    const k = (start: number, length: number) => span(t, start, length);

    // The book: off its sheet, down onto the desk, open.
    let lift = easeInOut(k(0, OPEN.LIFT));
    let coverOpen = easeInOut(k(OPEN.COVER_AT, OPEN.COVER_TIME));
    let beamOn = easeOut(k(OPEN.BEAM_AT, OPEN.BEAM_TIME));
    let mapOn = easeOut(k(OPEN.MAP_AT, OPEN.MAP_TIME));
    let fog = easeOut(k(0, OPEN.COVER));
    let pagesTurn = (i: number) => easeInOut(k(OPEN.PAGES_AT + i * OPEN.PAGE_STAGGER, OPEN.PAGE_TIME));

    if (closing) {
      closeT += dt;
      const c = (start: number, length: number) => span(closeT, start, length);
      mapOn = 1 - easeIn(c(0, CLOSE.MAP_TIME));
      beamOn = mapOn;
      coverOpen = 1 - easeInOut(c(CLOSE.COVER_AT, CLOSE.COVER_TIME));
      const turn = coverOpen;
      pagesTurn = () => turn;
      const fly = easeInOut(c(CLOSE.FLY_AT, CLOSE.FLY_TIME));
      fog = 1 - easeOut(c(CLOSE.CLEAR_AT, CLOSE.END - CLOSE.CLEAR_AT));
      lift = 1;
      if (closing.to) placeBook(closing.from, closing.to, fly, 0.5);
      else placeBook(closing.from, { ...closing.from, scale: closing.from.scale * 0.85 }, fly, 0);
      // The camera returns to where the sheet's rect was measured.
      const back = easeInOut(c(0, CLOSE.FLY_AT + 0.1));
      camPos.lerpVectors(closing.fromPos, new THREE.Vector3(...CAM.BOOK.position), back);
      camTarget.lerpVectors(closing.fromTarget, new THREE.Vector3(...CAM.BOOK.target), back);
      viewShift = closing.startShift * (1 - back);
      viewLift *= 1 - back;
      if (closeT >= CLOSE.END) {
        const done = closing.resolve;
        closing = null;
        done();
        return;
      }
    } else {
      placeBook(startPose, rest, lift, opts.from ? 0.55 : 0.2);
    }

    hinge.rotation.z = coverOpen * Math.PI;
    // The cover catches the light as it turns.
    const coverLight = 0.82 + 0.18 * Math.abs(Math.cos(coverOpen * Math.PI));
    coverMat.color.setScalar(coverLight);
    flutter.forEach((page, i) => {
      const turn = pagesTurn(i);
      page.pivot.visible = turn > 0.001 && turn < 0.999;
      page.pivot.rotation.z = turn * Math.PI;
      page.uniforms.uBend.value = Math.sin(turn * Math.PI) * 0.35 * (1 - i * 0.12);
      page.uniforms.uShade.value = 0.86 + 0.14 * Math.abs(Math.cos(turn * Math.PI));
    });

    // The shadow follows the book down.
    shadow.position.set(book.position.x, BOOK.REST[1] - 0.001, book.position.z);
    const shadowSize = W * 2.4 * restScale * (0.6 + 0.4 * lift);
    shadow.scale.set(shadowSize, H * 2 * restScale, 1);
    (shadow.material as THREE.MeshBasicMaterial).opacity = lift * (dark ? 0.9 : 0.55);

    // The fog closes over the library (and clears when closing).
    backdrop.style.opacity = String(fog);
    if (!covered && fog >= 0.999) {
      covered = true;
      opts.onCovered();
    }

    // Beam, map and dust.
    beamUniforms.uIntensity.value = beamOn * HOLO.BEAM * (dark ? 1 : 0.55);
    dustUniforms.uIntensity.value = beamOn * (dark ? 0.9 : 0.55);
    beam.visible = beamOn > 0.001;
    dust.visible = beam.visible;
    mapRise.scale.set(0.35 + 0.65 * mapOn, Math.max(0.001, mapOn), 1);
    mapRise.position.y = (1 - mapOn) * -(MAP.CENTER[1] - BOOK.REST[1]) * 0.9;
    fillUniforms.uReveal.value = mapOn * 1.05 - 0.02;
    const lineAlpha = mapOn * (dark ? 1 : 0.9);
    lineMaterial.opacity = lineAlpha * (HOLO.LINE + (1 - HOLO.LINE) * 0.2) * (1 - dim * 0.55);
    gridMaterial.opacity = mapOn * (dark ? 0.12 : 0.16) * (1 - dim * 0.5);
    frameMaterial.opacity = mapOn * (dark ? 0.6 : 0.7);
    mapRise.visible = mapOn > 0.001;
    // Idle float.
    mapGroup.position.y = MAP.CENTER[1] + Math.sin((clock / MAP.FLOAT_PERIOD) * Math.PI * 2) * MAP.FLOAT;

    // Lights on, west to east.
    if (!lightsOn && t >= OPEN.LIGHT_AT) {
      lightsOn = true;
      paintLines();
    }
    if (t < OPEN.LIGHT_AT + OPEN.LIGHT_SPREAD + 0.6 || closing) {
      for (const { index, at } of litOrder) states[index * 4 + 3] = Math.round(255 * clamp01((t - at) / 0.4) * (closing ? mapOn : 1));
      statesTex.needsUpdate = true;
    }

    // Focus dimming and the pin.
    dim += (dimTarget - dim) * (1 - Math.exp(-dt / 0.35));
    fillUniforms.uDim.value = dim;
    if (pin.visible) {
      pinAge += dt;
      const grow = easeOut(clamp01(pinAge / 0.6));
      const pulse = 1 + 0.25 * Math.sin(clock * 3.2);
      // The pin keeps its size on screen however close the camera comes.
      const size = Math.max(0.35, camPos.distanceTo(camTarget) / 3.2);
      ring.scale.setScalar(grow * pulse * size);
      dot.scale.setScalar(grow * size);
      ringMaterial.opacity = grow * 0.9 * mapOn;
      dotMaterial.opacity = grow * mapOn;
    }

    // Camera: the opening's path, a focus flight, or still; always a little lean toward the pointer.
    if (!closing) {
      if (phase === "open") {
        const move = easeInOut(k(OPEN.CAMERA_AT, OPEN.CAMERA_TIME));
        const end = pendingFocus ? { pos: pendingFocus.position, target: pendingFocus.target } : overview();
        camPos.lerpVectors(new THREE.Vector3(...CAM.BOOK.position), end.pos, move);
        camTarget.lerpVectors(new THREE.Vector3(...CAM.BOOK.target), end.target, move);
        if (!settled && t >= OPEN.LIGHT_AT) {
          settled = true;
          opts.onSettled();
        }
        if (t >= OPEN.END) {
          phase = "idle";
          pendingFocus = null;
        }
      } else if (flight) {
        const f = flight;
        const p = easeInOut(clamp01((clock - f.start) / f.time));
        camTarget.lerpVectors(f.fromTarget, f.toTarget, p);
        camPos.lerpVectors(f.fromPos, f.toPos, p);
        const away = camPos.clone().sub(camTarget).normalize();
        camPos.addScaledVector(away, Math.sin(Math.PI * p) * f.arc);
        if (p >= 1) flight = null;
      }
      viewShift += ((insetRight - insetLeft) / 2 - viewShift) * (1 - Math.exp(-dt / 0.3));
      viewLift += ((insetBottom - insetTop) / 2 - viewLift) * (1 - Math.exp(-dt / 0.3));
    }
    const leanK = phase === "idle" && pointerActive ? CAM.LEAN * (selectedIndex >= 0 ? 0.25 : 1) : 0;
    camera.position.copy(camPos).add(new THREE.Vector3(lean.x * leanK, lean.y * leanK * 0.5, 0));
    camera.lookAt(camTarget);
    if (Math.abs(viewShift) > 0.5 || Math.abs(viewLift) > 0.5) camera.setViewOffset(viewWidth, viewHeight, viewShift, viewLift, viewWidth, viewHeight);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();

    renderer.render(scene, camera);
    if (!started) {
      stamp("first-frame");
      started = true;
      opts.onStarted();
    }
  };

  const skip = () => {
    if (phase !== "open") return;
    t = Math.max(t, OPEN.END);
  };

  applyScheme();
  book.position.copy(startPose.position);
  book.quaternion.copy(startPose.quaternion);
  // Programs compile before the first frame (in parallel where the driver allows), so the book never stutters as it lifts.
  camera.position.copy(camPos);
  camera.lookAt(camTarget);
  for (const o of [beam, dust, mapRise]) o.visible = true;
  stamp("scene");
  try {
    await renderer.compileAsync(scene, camera);
  } catch {
    // Older drivers: compile on first use.
  }
  stamp("compiled");
  last = performance.now();
  frameId = requestAnimationFrame(renderFrame);

  return {
    setLit,
    highlight(codes) {
      flags.fill(0);
      if (codes) for (const code of codes) {
        const i = indexOf.get(code);
        if (i !== undefined) flags[i * 4] = 255;
      }
      flagsTex.needsUpdate = true;
    },
    focus,
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
    },
    skip,
    close(to) {
      return new Promise<void>((resolve) => {
        if (closing) return resolve();
        phase = "closing";
        t = Math.max(t, OPEN.END);
        lightsOn = true;
        opts.onHover(null, 0, 0);
        hoverIndex = -1;
        selectedIndex = -1;
        fillUniforms.uSelected.value = -1;
        setMark();
        dimTarget = 0;
        pin.visible = false;
        closeT = 0;
        closing = {
          from: { position: restPose.position.clone(), quaternion: restPose.quaternion.clone(), scale: restScale },
          to: to ? { ...poseOnRect(to), scale: 1 } : null,
          resolve,
          fromPos: camPos.clone(),
          fromTarget: camTarget.clone(),
          startShift: viewShift,
        };
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
      for (const d of disposables) d.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
