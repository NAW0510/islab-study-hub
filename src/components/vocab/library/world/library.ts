import * as THREE from "three";
import { mulberry32 } from "@/lib/vocab/layout/prng";
import { GALLERY_DEPTH, naveHalfWidth } from "@/lib/vocab/library/nave";
import type { QualityLevel } from "@/lib/vocab/library/quality";
import type { LayerFrame, WorldLayer } from "./engine";
import {
  FLAT_VERTEX,
  FLOOR_FRAGMENT,
  GLOW_FRAGMENT,
  MIST_FRAGMENT,
  SOLID_FRAGMENT,
  SOLID_VERTEX,
  WINDOW_FRAGMENT,
} from "./library-shaders";
import { LIBRARY_PALETTE, mixRgb, type Rgb } from "./palette";

/**
 * The library around the river, built from boxes and a few flat shapes, no
 * models to download. Modelled in units U (a ninth of the viewport height);
 * the eye is at y = 0 on the card plane and the nave runs away from it, the
 * walls just outside the river's columns at every width.
 *
 *   stacks     three storeys of shelves between slender piers, pale bindings
 *              by day and dark ones by night; galleries with balustrades,
 *              ladders leaning here and there, a cornice and a plain upper
 *              wall where the arches spring;
 *   arches     pointed transverse arches over the nave at every pier;
 *   window     a great pointed window at the end, its light scattered in
 *              the fog, a halo and a fan of god rays toward the visitor;
 *   lanterns   on long chains down the nave, lighting the stacks around them;
 *   floor      flagstones with a river of light down the middle;
 *   mist       sheets of it at a few depths, drifting; motes in the air.
 * About a dozen draw calls. Colours come in day/night pairs and glide with
 * uDark; inside a field's room everything leans toward the field's colour.
 */
const L = {
  FLOOR: -9,
  GALLERIES: [-2.4, 5] as const,
  SPRING: 11.4,
  NEAR: 8,
  BAY: 5.2,
  SHELF: 1.45,
  GALLERY_DEPTH,
  CASE_DEPTH: 0.95,
  TOP: 20,
};

const TIERS: Record<QualityLevel["tier"], { bays: number; bookMin: number; mist: number; rays: number; motes: number }> = {
  high: { bays: 24, bookMin: 0.1, mist: 5, rays: 12, motes: 1400 },
  medium: { bays: 18, bookMin: 0.14, mist: 4, rays: 9, motes: 800 },
  low: { bays: 13, bookMin: 0.2, mist: 2, rays: 6, motes: 400 },
};

type Part = { x: number; y: number; z: number; w: number; h: number; d: number; day: Rgb; night: Rgb; rz?: number };
type Lantern = { group: THREE.Group; light: THREE.Vector3; phase: number; drop: number };
type Glow = { material: THREE.ShaderMaterial; day: Rgb; night: Rgb };

export class LibraryLayer implements WorldLayer {
  /** Shared by every library material: one update moves them all. */
  readonly uniforms = {
    uDark: { value: 0 },
    uUnit: { value: 100 },
    uNave: { value: 500 },
    uCentreX: { value: 0 },
    uFogDay: { value: new THREE.Vector3(...LIBRARY_PALETTE.light.fog) },
    uFogNight: { value: new THREE.Vector3(...LIBRARY_PALETTE.dark.fog) },
    uFogStart: { value: 900 },
    uFogDensity: { value: 1 / 5200 },
    uTheme: { value: 0 },
    uThemeColor: { value: new THREE.Vector3(0.5, 0.5, 0.5) },
    uWindowScreen: { value: new THREE.Vector4(0, 0, 200, 0) },
    uScatterDay: { value: new THREE.Vector3(...LIBRARY_PALETTE.light.scatter) },
    uScatterNight: { value: new THREE.Vector3(...LIBRARY_PALETTE.dark.scatter) },
    uPixelRatio: { value: 1 },
    uLanterns: { value: Array.from({ length: 12 }, () => new THREE.Vector4()) },
    uLanternDay: { value: new THREE.Vector3(...LIBRARY_PALETTE.light.lantern) },
    uLanternNight: { value: new THREE.Vector3(...LIBRARY_PALETTE.dark.lantern) },
    uTime: { value: 0 },
    uDetail: { value: 0 },
  };

  private group: THREE.Group | null = null;
  private key = "";
  private tier: QualityLevel["tier"] = "high";
  private lanterns: Lantern[] = [];
  private glows: Glow[] = [];
  private mist: THREE.Mesh[] = [];
  private motes: THREE.Points | null = null;
  private readonly windowCentre = new THREE.Vector3();
  private windowHalf = 1;
  private readonly mistTexture = mistTexture();
  private readonly projected = new THREE.Vector3();
  private readonly edge = new THREE.Vector3();
  private readonly materials: THREE.Material[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  /** Lantern cages: pale iron by day, near black by night. */
  private cage: THREE.MeshBasicMaterial | null = null;
  /** Plain three.js fog for the few plain materials (cages, chains, motes); the shaders do their own. */
  private readonly sceneFog = new THREE.Fog(new THREE.Color(), 900, 7000);

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly river: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
  ) {
    scene.fog = this.sceneFog;
  }

  setTier(tier: QualityLevel["tier"]) {
    if (tier === this.tier) return;
    this.tier = tier;
    this.key = ""; // rebuilt at the new density on the next frame
  }

  private keep<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }

  private geometry<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  private shader(fragmentShader: string, vertexShader: string, extra: Record<string, THREE.IUniform> = {}, options: Partial<THREE.ShaderMaterialParameters> = {}) {
    return this.keep(new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: { ...this.uniforms, ...extra }, ...options }));
  }

  /** Light laid over the fog: a beam (shape 0) or a round glow (shape 1), with a day and a night colour. */
  private glow(shape: number, day: Rgb, night: Rgb, opacity: number) {
    const material = this.shader(GLOW_FRAGMENT, FLAT_VERTEX, { uColour: { value: new THREE.Vector3(...day) }, uOpacity: { value: opacity }, uShape: { value: shape } }, {
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.glows.push({ material, day, night });
    return material;
  }

  private instanced(geometry: THREE.BufferGeometry, material: THREE.Material, parts: Part[]) {
    const g = this.geometry(geometry.clone());
    const day = new Float32Array(parts.length * 3);
    const night = new Float32Array(parts.length * 3);
    parts.forEach((part, i) => {
      day.set(part.day, i * 3);
      night.set(part.night, i * 3);
    });
    g.setAttribute("aDay", new THREE.InstancedBufferAttribute(day, 3));
    g.setAttribute("aNight", new THREE.InstancedBufferAttribute(night, 3));
    const mesh = new THREE.InstancedMesh(g, material, Math.max(1, parts.length));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    parts.forEach((part, i) => {
      q.setFromEuler(e.set(0, 0, part.rz ?? 0));
      mesh.setMatrixAt(i, m.compose(p.set(part.x, part.y, part.z), q, s.set(part.w, part.h, part.d)));
    });
    mesh.count = parts.length;
    mesh.frustumCulled = false;
    return mesh;
  }

  private build(viewHeight: number, nave: number) {
    this.clear();
    const U = viewHeight / 9;
    const T = TIERS[this.tier];
    const P = LIBRARY_PALETTE;
    const random = mulberry32(20261118);
    const group = new THREE.Group();
    const u = this.uniforms;
    u.uUnit.value = U;
    u.uNave.value = nave;
    u.uFogStart.value = 9 * U;
    u.uFogDensity.value = 1 / (62 * U);
    this.sceneFog.near = 9 * U;
    this.sceneFog.far = 75 * U;

    // ---------------------------------------------------------------- the walls
    const stone: Part[] = [];
    const cases: Part[] = [];
    const sd = P.light.stone;
    const sn = P.dark.stone;
    const wd = P.light.wood;
    const wn = P.dark.wood;
    const shade = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];
    const nearZ = L.NEAR * U;
    const bay = L.BAY * U;
    const far = nearZ - T.bays * bay;
    const storeys: [number, number][] = [
      [L.FLOOR, L.GALLERIES[0]],
      [L.GALLERIES[0] + 0.3, L.GALLERIES[1]],
      [L.GALLERIES[1] + 0.3, L.SPRING - 0.5],
    ];

    for (const side of [-1, 1]) {
      for (let b = 0; b <= T.bays; b++) {
        const z = nearZ - b * bay;
        // A slender pier: shaft, plinth, capital, and the attached shaft the arch lands on.
        stone.push({ x: side * (nave + 0.35 * U), y: ((L.FLOOR + L.SPRING) / 2) * U, z, w: 0.75 * U, h: (L.SPRING - L.FLOOR) * U, d: 0.42 * U, day: sd, night: sn });
        stone.push({ x: side * (nave + 0.3 * U), y: (L.FLOOR + 0.35) * U, z, w: 0.95 * U, h: 0.7 * U, d: 0.62 * U, day: shade(sd, 0.97), night: sn });
        stone.push({ x: side * (nave + 0.12 * U), y: (L.SPRING - 0.15) * U, z, w: 0.6 * U, h: 0.35 * U, d: 0.6 * U, day: sd, night: sn });
        stone.push({ x: side * (nave - 0.08 * U), y: ((L.GALLERIES[1] + L.SPRING) / 2) * U, z, w: 0.22 * U, h: (L.SPRING - L.GALLERIES[1]) * U, d: 0.22 * U, day: sd, night: sn });
        if (b === T.bays) break;
        const z0 = z - 0.25 * U;
        const z1 = z - bay + 0.25 * U;
        const span = z0 - z1;
        const mid = (z0 + z1) / 2;

        for (const [bottom, top] of storeys) {
          cases.push({ x: side * (nave + L.CASE_DEPTH * U), y: ((bottom + top) / 2) * U, z: mid, w: 0.08 * U, h: (top - bottom) * U, d: span, day: shade(wd, 0.8), night: shade(wn, 0.7) });
          for (let y = bottom + 0.08; y + 1.15 < top; y += L.SHELF) {
            cases.push({ x: side * (nave + (L.CASE_DEPTH / 2) * U), y: y * U, z: mid, w: L.CASE_DEPTH * U, h: 0.07 * U, d: span, day: wd, night: wn });
            let zz = z0 - 0.04 * U;
            while (zz > z1 + 0.15 * U) {
              if (random() < 0.05) {
                // A short pile lying flat.
                const n = 2 + Math.floor(random() * 3);
                for (let k = 0; k < n; k++) {
                  cases.push({ x: side * (nave + 0.45 * U), y: (y + 0.08 + 0.09 * k + 0.045) * U, z: zz - 0.45 * U, w: 0.72 * U, h: 0.09 * U, d: 0.85 * U, day: pick(P.light.books, random), night: pick(P.dark.books, random) });
                }
                zz -= 1 * U;
                continue;
              }
              const w = (T.bookMin + random() * 0.17) * U;
              const h = Math.min((L.SHELF - 0.14) * U, (0.86 + random() * 0.4) * U);
              const d = (0.74 + random() * 0.14) * U;
              const lean = random() < 0.04 ? (random() - 0.5) * 0.35 : 0;
              cases.push({ x: side * (nave + d / 2 + 0.05 * U), y: y * U + 0.035 * U + h / 2, z: zz - w / 2, w: d, h, d: w, day: pick(P.light.books, random), night: pick(P.dark.books, random), rz: lean });
              zz -= w + (random() < 0.08 ? 0.3 * U : 0.01 * U);
            }
          }
          cases.push({ x: side * (nave + (L.CASE_DEPTH / 2) * U), y: (top - 0.04) * U, z: mid, w: L.CASE_DEPTH * U, h: 0.1 * U, d: span, day: wd, night: wn });
        }

        // Galleries: slab, rails and balusters, the whole length.
        for (const g of L.GALLERIES) {
          stone.push({ x: side * (nave - (L.GALLERY_DEPTH / 2) * U), y: (g - 0.12) * U, z: z - bay / 2, w: L.GALLERY_DEPTH * U, h: 0.24 * U, d: bay, day: sd, night: sn });
          stone.push({ x: side * (nave - L.GALLERY_DEPTH * U), y: (g + 0.95) * U, z: z - bay / 2, w: 0.1 * U, h: 0.08 * U, d: bay, day: sd, night: sn });
          stone.push({ x: side * (nave - L.GALLERY_DEPTH * U), y: (g + 0.12) * U, z: z - bay / 2, w: 0.12 * U, h: 0.08 * U, d: bay, day: sd, night: sn });
          for (let k = 0.25; k < L.BAY; k += 0.45) {
            stone.push({ x: side * (nave - L.GALLERY_DEPTH * U), y: (g + 0.53) * U, z: z - k * U, w: 0.06 * U, h: 0.78 * U, d: 0.06 * U, day: shade(sd, 0.98), night: sn });
          }
        }

        // A rolling ladder in some bays, leaning on the stacks.
        if (random() < 0.28) {
          const storey = storeys[Math.floor(random() * 2)];
          const height = (storey[1] - storey[0] - 0.4) * U;
          const lz = mid + (random() - 0.5) * span * 0.5;
          const tilt = side * 0.14;
          for (const off of [-0.22, 0.22]) {
            cases.push({ x: side * (nave - 0.32 * U), y: storey[0] * U + height / 2, z: lz + off * U, w: 0.06 * U, h: height, d: 0.06 * U, day: wd, night: wn, rz: tilt });
          }
          for (let r = 0.4; r < height / U; r += 0.42) {
            cases.push({ x: side * (nave - 0.32 * U) - Math.sin(tilt) * (r * U - height / 2), y: storey[0] * U + r * U, z: lz, w: 0.05 * U, h: 0.05 * U, d: 0.48 * U, day: wd, night: wn });
          }
        }

        // Cornice and the plain upper wall.
        stone.push({ x: side * (nave + 0.2 * U), y: (L.SPRING + 0.1) * U, z: z - bay / 2, w: 0.7 * U, h: 0.3 * U, d: bay, day: sd, night: sn });
        stone.push({ x: side * (nave + 0.75 * U), y: ((L.SPRING + L.TOP) / 2) * U, z: z - bay / 2, w: 0.5 * U, h: (L.TOP - L.SPRING) * U, d: bay, day: shade(sd, 0.96), night: shade(sn, 0.9) });
      }
    }

    const box = this.geometry(new THREE.BoxGeometry(1, 1, 1));
    const solid = this.shader(SOLID_FRAGMENT, SOLID_VERTEX, { uReach: { value: 1 } });
    group.add(this.instanced(box, solid, stone), this.instanced(box, solid, cases));

    // Pointed transverse arches at every pier.
    const archGeo = this.geometry(new THREE.ExtrudeGeometry(pointedArch(nave + 0.3 * U, 0.55 * U), { depth: 0.5 * U, bevelEnabled: false, curveSegments: 20 }));
    const arches: Part[] = [];
    for (let b = 0; b <= T.bays; b++) arches.push({ x: 0, y: L.SPRING * U, z: nearZ - b * bay - 0.25 * U, w: 1, h: 1, d: 1, day: sd, night: sn });
    group.add(this.instanced(archGeo, solid, arches));

    // ---------------------------------------------------------------- the floor
    const plain = (day: Rgb, night: Rgb, river: boolean) =>
      this.shader(FLOOR_FRAGMENT, FLAT_VERTEX, {
        uDay: { value: new THREE.Vector3(...day) },
        uNight: { value: new THREE.Vector3(...night) },
        uRiverDay: { value: new THREE.Vector3(...(river ? P.light.river : ([0, 0, 0] as Rgb))) },
        uRiverNight: { value: new THREE.Vector3(...(river ? P.dark.river : ([0, 0, 0] as Rgb))) },
      });
    const floor = new THREE.Mesh(this.geometry(new THREE.PlaneGeometry(nave * 2.4, nearZ - far + 6 * U)), plain(P.light.floor, P.dark.floor, true));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, L.FLOOR * U, (nearZ + far) / 2);
    group.add(floor);

    // ---------------------------------------------------------------- the window
    const half = nave * 0.6;
    const windowHeight = half * 3.3;
    const windowZ = far - 0.6 * U;
    const windowBottom = (L.FLOOR + 2.5) * U;
    const windowMesh = new THREE.Mesh(
      this.geometry(new THREE.PlaneGeometry(half * 2, windowHeight)),
      this.shader(WINDOW_FRAGMENT, FLAT_VERTEX, {
        uGlassDay: { value: new THREE.Vector3(...P.light.glass) },
        uGlassNight: { value: new THREE.Vector3(...P.dark.glass) },
        uLead: { value: new THREE.Vector3(...P.light.lead) },
      }),
    );
    windowMesh.position.set(0, windowBottom + windowHeight / 2, windowZ);
    const endWall = new THREE.Mesh(this.geometry(new THREE.PlaneGeometry(nave * 2.6, (L.TOP - L.FLOOR) * U)), plain(sd, sn, false));
    endWall.position.set(0, ((L.FLOOR + L.TOP) / 2) * U, windowZ - 2);
    group.add(windowMesh, endWall);
    this.windowCentre.set(0, windowBottom + windowHeight * 0.55, windowZ);
    this.windowHalf = half;

    // Halo and a fan of god rays, fading before they reach the cards.
    const halo = new THREE.Mesh(this.geometry(new THREE.PlaneGeometry(half * 5, half * 5)), this.glow(1, P.light.halo, P.dark.halo, 0.9));
    halo.position.copy(this.windowCentre).add(new THREE.Vector3(0, 0, 4 * U));
    group.add(halo);
    for (let i = 0; i < T.rays; i++) {
      const spread = (i / Math.max(1, T.rays - 1) - 0.5) * 2;
      const from = this.windowCentre.clone().add(new THREE.Vector3(spread * half * 0.6, (random() - 0.3) * half, 0));
      const to = new THREE.Vector3(spread * nave * 1.1 + (random() - 0.5) * nave * 0.4, (L.FLOOR + random() * 4) * U, nearZ - 14 * U - random() * 20 * U);
      group.add(new THREE.Mesh(this.geometry(ribbon(from, to, (0.5 + random() * 0.7) * U, (2 + random() * 3) * U)), this.glow(0, P.light.ray, P.dark.ray, 0.16 + random() * 0.12)));
    }

    // ---------------------------------------------------------------- lanterns
    const body = this.keep(new THREE.MeshBasicMaterial({ color: new THREE.Color() }));
    this.cage = body;
    const chain = this.keep(new THREE.LineBasicMaterial({ color: new THREE.Color().setRGB(0.35, 0.33, 0.3), transparent: true, opacity: 0.6 }));
    const flame = this.glow(1, P.light.flame, P.dark.flame, 1);
    const bodyGeo = this.geometry(new THREE.BoxGeometry(0.3 * U, 0.46 * U, 0.3 * U));
    const flameGeo = this.geometry(new THREE.PlaneGeometry(1.3 * U, 1.3 * U));
    // From the third bay on and close to the walls, so none hangs in front of the head or the sheets.
    for (let b = 3; b < T.bays && this.lanterns.length < 12; b += 2) {
      const side = this.lanterns.length % 2 === 0 ? -1 : 1;
      const lantern = new THREE.Group();
      const drop = (4 + random() * 4) * U;
      lantern.position.set(side * nave * (0.78 + random() * 0.12), (L.SPRING + 3) * U, nearZ - b * bay - bay / 2);
      const line = new THREE.Line(this.geometry(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, -drop, 0)])), chain);
      const cage = new THREE.Mesh(bodyGeo, body);
      cage.position.y = -drop - 0.23 * U;
      const light = new THREE.Mesh(flameGeo, flame);
      light.position.y = -drop - 0.25 * U;
      lantern.add(line, cage, light);
      group.add(lantern);
      this.lanterns.push({ group: lantern, light: new THREE.Vector3(), phase: random() * Math.PI * 2, drop });
    }

    // ---------------------------------------------------------------- mist and motes
    for (let i = 0; i < T.mist; i++) {
      const sheet = new THREE.Mesh(
        this.geometry(new THREE.PlaneGeometry(nave * 3, 8 * U)),
        this.shader(MIST_FRAGMENT, FLAT_VERTEX, { uMap: { value: this.mistTexture }, uOpacity: { value: 0.5 }, uDrift: { value: random() } }, { transparent: true, depthWrite: false }),
      );
      sheet.position.set(0, (L.FLOOR + 3 + random() * 6) * U, nearZ - (6 + (i * (T.bays * L.BAY - 10)) / Math.max(1, T.mist)) * U);
      sheet.userData.speed = 0.004 + random() * 0.006;
      group.add(sheet);
      this.mist.push(sheet);
    }
    const positions = new Float32Array(T.motes * 3);
    for (let i = 0; i < T.motes; i++) {
      positions[i * 3] = (random() - 0.5) * nave * 2;
      positions[i * 3 + 1] = (L.FLOOR + random() * (L.SPRING - L.FLOOR + 4)) * U;
      positions[i * 3 + 2] = nearZ - random() * (nearZ - far);
    }
    const moteGeo = this.geometry(new THREE.BufferGeometry());
    moteGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.motes = new THREE.Points(
      moteGeo,
      this.keep(new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })),
    );
    this.motes.frustumCulled = false;
    group.add(this.motes);

    this.scene.add(group);
    this.group = group;
  }

  update(frame: LayerFrame) {
    const rect = this.river.getBoundingClientRect();
    const canvasLeft = this.canvas.getBoundingClientRect().left;
    const U = frame.viewHeight / 9;
    // Wide enough that the galleries' rails stand clear of the sheets (lib/vocab/library/nave.ts).
    const nave = naveHalfWidth(frame.viewWidth, frame.viewHeight, rect.width);
    const centreX = rect.left + rect.width / 2 - canvasLeft - frame.viewWidth / 2;
    const key = `${Math.round(frame.viewHeight / 10)}:${Math.round(nave / 10)}:${this.tier}`;
    if (key !== this.key) {
      this.key = key;
      this.build(frame.viewHeight, nave);
    }
    const group = this.group;
    if (!group) return;
    const u = this.uniforms;
    u.uTime.value = frame.time;
    u.uPixelRatio.value = frame.pixelRatio;
    u.uDark.value = frame.dark;
    u.uDetail.value = frame.detail;
    u.uTheme.value = frame.theme;
    u.uThemeColor.value.set(frame.themeColor.r, frame.themeColor.g, frame.themeColor.b);

    // The room follows the river sideways, pans with the transitions, and rises a little with the scroll.
    group.position.x = centreX + frame.pan * 0.35;
    group.position.y = Math.min(frame.scrollY * 0.03, 1.5 * U);
    u.uCentreX.value = group.position.x;

    this.lanterns.forEach((l, i) => {
      l.group.rotation.z = Math.sin(frame.time * 0.55 + l.phase) * 0.03;
      l.group.rotation.x = Math.cos(frame.time * 0.4 + l.phase) * 0.02;
      l.light.set(0, -l.drop - 0.25 * U, 0);
      l.group.localToWorld(l.light);
      const flicker = 0.9 + 0.1 * Math.sin(frame.time * 6.3 + i * 1.7) * Math.sin(frame.time * 2.9 + i);
      u.uLanterns.value[i].set(l.light.x, l.light.y, l.light.z, flicker);
    });
    for (let i = this.lanterns.length; i < 12; i++) u.uLanterns.value[i].w = 0;

    for (const g of this.glows) g.material.uniforms.uColour.value.set(...mixRgb(g.day, g.night, frame.dark));
    this.cage?.color.setRGB(...mixRgb([0.66, 0.62, 0.56], [0.08, 0.07, 0.06], frame.dark));
    this.sceneFog.color.copy(frame.fog);
    for (const sheet of this.mist) {
      const m = sheet.material as THREE.ShaderMaterial;
      m.uniforms.uDrift.value += (sheet.userData.speed as number) * frame.dt;
      m.uniforms.uOpacity.value = 0.5 - 0.2 * frame.dark;
    }
    if (this.motes) {
      const m = this.motes.material as THREE.PointsMaterial;
      m.color.setRGB(...mixRgb(LIBRARY_PALETTE.light.mote, LIBRARY_PALETTE.dark.mote, frame.dark));
      m.opacity = 0.35 + 0.35 * frame.dark;
      this.motes.position.y = Math.sin(frame.time * 0.05) * 0.4 * U;
    }

    // Where the window is on screen (gl_FragCoord counts from the canvas bottom), for the light it scatters in the fog.
    group.localToWorld(this.projected.copy(this.windowCentre));
    this.edge.copy(this.projected).x += this.windowHalf;
    this.projected.project(this.camera);
    this.edge.project(this.camera);
    const sx = (this.projected.x * 0.5 + 0.5) * frame.viewWidth;
    const sy = (this.projected.y * 0.5 + 0.5) * frame.viewHeight;
    const radius = Math.abs((this.edge.x - this.projected.x) * 0.5 * frame.viewWidth) * 3;
    u.uWindowScreen.value.set(sx, sy, Math.max(80, radius), 0);
  }

  private clear() {
    if (this.group) this.scene.remove(this.group);
    this.group = null;
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.geometries.length = 0;
    this.materials.length = 0;
    this.lanterns = [];
    this.glows = [];
    this.mist = [];
    this.motes = null;
    this.cage = null;
  }

  dispose() {
    this.clear();
    this.mistTexture.dispose();
    if (this.scene.fog === this.sceneFog) this.scene.fog = null;
  }
}

function pick<T>(list: readonly T[], random: () => number): T {
  return list[Math.floor(random() * list.length)];
}

/** Points of an equilateral pointed arch of half span a, from the left springing over the apex to the right one. */
function archPoints(a: number, steps = 18): THREE.Vector2[] {
  const left: THREE.Vector2[] = [];
  for (let i = 0; i <= steps; i++) {
    // The left arc is centred on the right springing point, radius 2a.
    const angle = Math.PI - (Math.PI / 3) * (i / steps);
    left.push(new THREE.Vector2(a + 2 * a * Math.cos(angle), 2 * a * Math.sin(angle)));
  }
  const right = left
    .slice(0, -1)
    .reverse()
    .map((v) => new THREE.Vector2(-v.x, v.y));
  return [...left, ...right];
}

/** A pointed arch rib: the band between an outer arch of half span a and an inner one t narrower, springing at y = 0. */
function pointedArch(a: number, t: number): THREE.Shape {
  const outer = archPoints(a);
  const inner = archPoints(a - t).reverse();
  const shape = new THREE.Shape(outer);
  for (const v of inner) shape.lineTo(v.x, v.y);
  shape.closePath();
  return shape;
}

/** A long quad from `from` (uv.y = 1) to `to` (uv.y = 0), narrow at the window and wider toward the visitor. */
function ribbon(from: THREE.Vector3, to: THREE.Vector3, startWidth: number, endWidth: number): THREE.BufferGeometry {
  const dir = to.clone().sub(from).normalize();
  const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 0, 1));
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
  side.normalize();
  const a = from.clone().addScaledVector(side, -startWidth / 2);
  const b = from.clone().addScaledVector(side, startWidth / 2);
  const c = to.clone().addScaledVector(side, endWidth / 2);
  const d = to.clone().addScaledVector(side, -endWidth / 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([a, b, c, d].flatMap((v) => [v.x, v.y, v.z]), 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

/** Soft wisps that tile sideways (alpha only). */
function mistTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const random = mulberry32(7);
  for (let i = 0; i < 80; i++) {
    const x = random() * 512;
    const y = 30 + random() * 70;
    const r = 30 + random() * 80;
    for (const dx of [-512, 0, 512]) {
      const g = ctx.createRadialGradient(x + dx, y, 0, x + dx, y, r);
      g.addColorStop(0, "rgba(255,255,255,0.2)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x + dx - r, y - r, r * 2, r * 2);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}
