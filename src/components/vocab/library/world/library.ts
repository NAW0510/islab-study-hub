import * as THREE from "three";
import { mulberry32 } from "@/lib/vocab/layout/prng";
import type { QualityLevel } from "@/lib/vocab/library/quality";
import type { LayerFrame, WorldLayer } from "./engine";
import { WORLD_COLORS, type Scheme } from "./palette";

/**
 * The library behind the river, built from boxes and flat shapes (no models
 * to download). Modelled in library units U = a ninth of the viewport
 * height; the walls stand just outside the river's columns at every width.
 *
 *   stacks    three storeys of shelves down both sides of the nave, books
 *             in muted versions of the field colours (one instanced draw,
 *             nearest first, so a lower tier simply draws fewer far books);
 *   arches    pointed arches over the nave at every other pier;
 *   window    a tall window at the far end, with long beams of light;
 *   lanterns  on chains down the nave, glowing and swaying a little;
 *   floor     stone, with a faint river of light along the middle;
 *   veils     mist at a few depths, drifting slowly.
 *
 * Day: pearl fog, ivory stone, warm white light. Night: ink-blue fog, dark
 * stacks, lamp-gold light. Everything is drawn in display sRGB (raw colours).
 */
const NEAR = -160;
const FAR = -7000;

type Built = { group: THREE.Group; books: THREE.InstancedMesh; bookTotal: number; lanterns: THREE.Group[]; glows: THREE.Sprite[]; veils: THREE.Mesh[] };

export class LibraryLayer implements WorldLayer {
  private built: Built | null = null;
  private key = "";
  private scheme: Scheme = "light";
  private tier: QualityLevel["tier"] = "high";
  private readonly glowTexture = radialTexture();
  private readonly mistTexture = mistTexture();
  private readonly materials = {
    stone: new THREE.MeshLambertMaterial(),
    wood: new THREE.MeshLambertMaterial(),
    books: new THREE.MeshLambertMaterial(),
    floor: new THREE.MeshLambertMaterial(),
    dark: new THREE.MeshBasicMaterial(),
    window: new THREE.MeshBasicMaterial({ transparent: true }),
    beam: new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    river: new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    veil: new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }),
    chain: new THREE.LineBasicMaterial({ transparent: true }),
  };
  private readonly hemi = new THREE.HemisphereLight();
  private readonly sun = new THREE.DirectionalLight();
  private readonly ambient = new THREE.AmbientLight();
  private readonly bookColors: THREE.Color[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly river: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
  ) {
    this.materials.window.map = this.glowTexture;
    this.materials.beam.map = this.glowTexture;
    this.materials.river.map = this.glowTexture;
    this.materials.veil.map = this.mistTexture;
    this.sun.position.set(-0.3, 0.6, -1);
    scene.add(this.hemi, this.sun, this.ambient);
    scene.fog = new THREE.Fog(new THREE.Color(), 600, 7400);
  }

  setTier(tier: QualityLevel["tier"]) {
    this.tier = tier;
    this.applyTier();
  }

  private applyTier() {
    if (!this.built) return;
    const share = this.tier === "high" ? 1 : this.tier === "medium" ? 0.6 : 0.35;
    this.built.books.count = Math.round(this.built.bookTotal * share);
    this.built.veils.forEach((v, i) => (v.visible = this.tier !== "low" || i % 2 === 0));
  }

  setScheme(scheme: Scheme) {
    this.scheme = scheme;
    const c = WORLD_COLORS[scheme];
    const m = this.materials;
    const dark = scheme === "dark";
    m.stone.color.setRGB(...c.stone);
    m.wood.color.setRGB(...c.wood);
    m.books.color.setRGB(1, 1, 1);
    m.floor.color.setRGB(...c.stone).multiplyScalar(dark ? 0.8 : 0.95);
    m.dark.color.setRGB(...c.wood).multiplyScalar(0.5);
    m.window.color.setRGB(...c.light);
    m.window.opacity = dark ? 0.85 : 0.95;
    m.beam.color.setRGB(...c.light).multiplyScalar(dark ? 0.16 : 0.22);
    m.river.color.setRGB(...c.light).multiplyScalar(dark ? 0.35 : 0.25);
    m.veil.color.setRGB(...c.fog);
    m.veil.opacity = dark ? 0.35 : 0.55;
    m.chain.color.setRGB(...c.wood).multiplyScalar(0.6);
    m.chain.opacity = 0.7;
    this.hemi.color.setRGB(...c.light);
    this.hemi.groundColor.setRGB(...c.fog);
    this.hemi.intensity = dark ? 1.7 : 1.6;
    this.sun.color.setRGB(...c.light);
    this.sun.intensity = dark ? 0.6 : 1.1;
    this.ambient.color.setRGB(...c.fog);
    this.ambient.intensity = dark ? 1 : 0.9;
    this.built?.glows.forEach((g) => {
      (g.material as THREE.SpriteMaterial).color.setRGB(...c.light).multiplyScalar(dark ? 1 : 0.6);
    });
    if (this.built) this.paintBooks(this.built.books);
  }

  private paintBooks(books: THREE.InstancedMesh) {
    const dark = this.scheme === "dark";
    const shade = new THREE.Color();
    for (let i = 0; i < books.count && i < this.bookColors.length; i++) {
      shade.copy(this.bookColors[i]);
      if (dark) shade.multiplyScalar(0.7);
      books.setColorAt(i, shade);
    }
    if (books.instanceColor) books.instanceColor.needsUpdate = true;
  }

  /** Rebuilds when the viewport or the river's width changed enough to move the walls. */
  private build(viewHeight: number, halfNave: number, centreX: number) {
    this.dispose(true);
    const U = viewHeight / 9;
    const random = mulberry32(20261117);
    const group = new THREE.Group();
    group.position.x = centreX;
    const m = this.materials;
    const box = new THREE.BoxGeometry(1, 1, 1);
    const floorY = -5.3 * U;
    const storey = 3 * U;
    const bay = 2.3 * U;
    const bays = Math.floor((NEAR - FAR) / bay);
    const shelfDepth = 0.75 * U;

    // Floor and the river of light.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(halfNave * 6, NEAR - FAR + 2000), m.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, floorY, (NEAR + FAR) / 2);
    group.add(floor);
    const riverOfLight = new THREE.Mesh(new THREE.PlaneGeometry(halfNave * 0.5, NEAR - FAR), m.river);
    riverOfLight.rotation.x = -Math.PI / 2;
    riverOfLight.position.set(0, floorY + 1, (NEAR + FAR) / 2);
    group.add(riverOfLight);

    // Shelving: boards, uprights, gallery rails, and the books (instanced, nearest first).
    type Box = { x: number; y: number; z: number; w: number; h: number; d: number };
    const boards: Box[] = [];
    const uprights: Box[] = [];
    const books: (Box & { tint: THREE.Color })[] = [];
    const palette = [0x2a78d6, 0xeb6834, 0x1baf7a, 0xeda100, 0xe87ba4, 0x008300, 0x6250d6, 0xe34948, 0x0e93b5, 0xa5622a].map((hex) => {
      const c = new THREE.Color().setRGB(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
      // Muted: an old binding, not a sticker.
      return c.lerp(new THREE.Color().setRGB(0.55, 0.5, 0.45), 0.55);
    });
    for (const side of [-1, 1]) {
      const wallX = side * (halfNave + shelfDepth / 2);
      for (let b = 0; b < bays; b++) {
        const z0 = NEAR - b * bay;
        uprights.push({ x: wallX, y: floorY + 1.5 * storey, z: z0, w: shelfDepth * 1.1, h: 3 * storey + 0.4 * U, d: 0.18 * U });
        for (let s = 0; s < 3; s++) {
          const base = floorY + s * storey;
          // The gallery rail of each storey above the ground.
          if (s > 0) boards.push({ x: side * (halfNave - 0.05 * U), y: base + 0.55 * U, z: z0 - bay / 2, w: 0.05 * U, h: 0.05 * U, d: bay });
          for (let r = 0; r < 3; r++) {
            const shelfY = base + 0.15 * U + r * 0.95 * U;
            boards.push({ x: wallX, y: shelfY, z: z0 - bay / 2, w: shelfDepth, h: 0.06 * U, d: bay });
            let z = z0 - 0.12 * U;
            while (z > z0 - bay + 0.12 * U) {
              const thick = (0.07 + random() * 0.09) * U;
              const tall = (0.55 + random() * 0.3) * U;
              if (random() < 0.06) {
                z -= thick * 2; // a gap on the shelf
                continue;
              }
              books.push({ x: wallX - side * 0.05 * U, y: shelfY + 0.03 * U + tall / 2, z: z - thick / 2, w: shelfDepth * (0.75 + random() * 0.15), h: tall, d: thick, tint: palette[Math.floor(random() * palette.length)].clone().multiplyScalar(0.8 + random() * 0.35) });
              z -= thick + 0.006 * U;
            }
          }
        }
      }
    }
    books.sort((a, b) => b.z - a.z);
    const instanced = (list: Box[], material: THREE.Material) => {
      const mesh = new THREE.InstancedMesh(box, material, Math.max(1, list.length));
      const matrix = new THREE.Matrix4();
      list.forEach((p, i) => {
        matrix.makeScale(p.w, p.h, p.d);
        matrix.setPosition(p.x, p.y, p.z);
        mesh.setMatrixAt(i, matrix);
      });
      mesh.count = list.length;
      mesh.frustumCulled = false;
      return mesh;
    };
    group.add(instanced(boards, m.wood), instanced(uprights, m.stone));
    const bookMesh = instanced(books, m.books);
    this.bookColors.length = 0;
    books.forEach((b, i) => {
      this.bookColors.push(b.tint);
      bookMesh.setColorAt(i, b.tint);
    });
    group.add(bookMesh);

    // Pointed arches over the nave, every other pier.
    const span = halfNave + shelfDepth;
    const archShape = pointedArch(span, 4.4 * U, 0.35 * U);
    const archGeo = new THREE.ShapeGeometry(archShape, 24);
    const archTop = floorY + 3 * storey;
    const arches: THREE.Mesh[] = [];
    for (let b = 0; b < bays; b += 2) {
      const arch = new THREE.Mesh(archGeo, m.stone);
      arch.position.set(0, archTop, NEAR - b * bay - 0.1 * U);
      arches.push(arch);
    }
    group.add(...arches);

    // The great window at the far end, and its beams.
    const windowShape = pointedArch(span * 0.55, 10 * U, 10 * U);
    const windowMesh = new THREE.Mesh(new THREE.ShapeGeometry(windowShape, 32), m.window);
    windowMesh.position.set(0, floorY + 2 * U, FAR - 200);
    group.add(windowMesh);
    const mullions = new THREE.Group();
    for (let i = -2; i <= 2; i++) {
      const bar = new THREE.Mesh(box, m.dark);
      bar.scale.set(0.12 * U, 12 * U, 0.1 * U);
      bar.position.set((i * span * 0.55) / 3, floorY + 8 * U, FAR - 190);
      mullions.add(bar);
    }
    group.add(mullions);
    const beamGeo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < 4; i++) {
      const beam = new THREE.Mesh(beamGeo, m.beam);
      beam.scale.set(span * (0.25 + i * 0.08), 5600, 1);
      beam.position.set((i - 1.5) * span * 0.18, floorY + 4 * U, FAR + 2400);
      beam.rotation.set(-Math.PI / 2 + 0.32, 0, (i - 1.5) * 0.08);
      group.add(beam);
    }

    // Lanterns on chains, swaying.
    const lanterns: THREE.Group[] = [];
    const glows: THREE.Sprite[] = [];
    for (let b = 1; b < bays; b += 3) {
      for (const side of [-1, 1]) {
        const lantern = new THREE.Group();
        const anchorY = archTop + 3.6 * U;
        const drop = (2.6 + random() * 2.2) * U;
        lantern.position.set(side * (halfNave - 0.9 * U), anchorY, NEAR - b * bay - (side > 0 ? bay / 2 : 0));
        const chain = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -drop, 0)]), m.chain);
        const body = new THREE.Mesh(box, m.dark);
        body.scale.set(0.28 * U, 0.42 * U, 0.28 * U);
        body.position.y = -drop - 0.2 * U;
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        glow.scale.setScalar(1.5 * U);
        glow.position.y = -drop - 0.25 * U;
        lantern.add(chain, body, glow);
        lantern.userData.phase = random() * Math.PI * 2;
        lanterns.push(lantern);
        glows.push(glow);
        group.add(lantern);
      }
    }

    // Veils of mist at a few depths.
    const veils: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      const veil = new THREE.Mesh(new THREE.PlaneGeometry(span * 4, 9 * U), m.veil.clone());
      veil.position.set(0, floorY + (1.5 + random() * 3) * U, -900 - i * 1000);
      veil.userData.phase = random() * Math.PI * 2;
      veil.userData.reach = span * (0.15 + random() * 0.2);
      veils.push(veil);
      group.add(veil);
    }

    this.scene.add(group);
    this.built = { group, books: bookMesh, bookTotal: books.length, lanterns, glows, veils };
    this.setScheme(this.scheme);
    this.applyTier();
  }

  update(frame: LayerFrame) {
    const rect = this.river.getBoundingClientRect();
    const canvasLeft = this.canvas.getBoundingClientRect().left;
    const halfNave = Math.max(frame.viewWidth * 0.3, rect.width / 2 + frame.viewHeight / 9 * 0.35);
    const centreX = rect.left + rect.width / 2 - canvasLeft - frame.viewWidth / 2;
    const key = `${Math.round(frame.viewHeight / 8)}:${Math.round(halfNave / 8)}:${Math.round(centreX / 8)}`;
    if (key !== this.key) {
      this.key = key;
      this.build(frame.viewHeight, halfNave, centreX);
    }
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.copy(frame.fog);
    const built = this.built;
    if (!built) return;
    // A little parallax with the scroll (capped), so the room has depth.
    built.group.position.y = Math.min(frame.scrollY * 0.03, (frame.viewHeight / 9) * 1.5);
    for (const lantern of built.lanterns) {
      const phase = lantern.userData.phase as number;
      lantern.rotation.z = Math.sin(frame.time * 0.6 + phase) * 0.035;
      lantern.rotation.x = Math.cos(frame.time * 0.45 + phase) * 0.02;
    }
    const flicker = WORLD_COLORS[this.scheme].glow;
    built.glows.forEach((g, i) => {
      (g.material as THREE.SpriteMaterial).opacity = flicker * (0.85 + 0.15 * Math.sin(frame.time * 7 + i * 1.7) * Math.sin(frame.time * 3.1 + i));
    });
    // Mist drifts sideways, slowly, each veil at its own pace.
    for (const veil of built.veils) {
      veil.position.x = Math.sin(frame.time * 0.03 + (veil.userData.phase as number)) * (veil.userData.reach as number);
    }
  }

  dispose(keepShared = false) {
    if (this.built) {
      this.scene.remove(this.built.group);
      this.built.group.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Sprite) {
          o.geometry?.dispose();
          if (o instanceof THREE.Sprite || (o instanceof THREE.Mesh && o.material instanceof THREE.MeshBasicMaterial && o.material.map === this.mistTexture)) {
            (o.material as THREE.Material).dispose();
          }
        }
      });
      this.built = null;
    }
    if (keepShared) return;
    this.scene.remove(this.hemi, this.sun, this.ambient);
    this.scene.fog = null;
    for (const material of Object.values(this.materials)) material.dispose();
    this.glowTexture.dispose();
    this.mistTexture.dispose();
  }
}

/** A pointed (Gothic) arch band: outer half-width w, rise h, band thickness t. With t ≥ h it is a solid window. */
function pointedArch(w: number, h: number, t: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-w, 0);
  shape.quadraticCurveTo(-w, h * 0.75, 0, h);
  shape.quadraticCurveTo(w, h * 0.75, w, 0);
  if (t < h) {
    const iw = w - t;
    const ih = h - t;
    shape.lineTo(iw, 0);
    shape.quadraticCurveTo(iw, ih * 0.75, 0, ih);
    shape.quadraticCurveTo(-iw, ih * 0.75, -iw, 0);
  } else {
    shape.lineTo(w, -h * 0.9);
    shape.lineTo(-w, -h * 0.9);
  }
  shape.closePath();
  return shape;
}

/** A soft white disc, brightest in the middle. */
function radialTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

/** Soft, wide wisps that tile sideways. */
function mistTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const random = mulberry32(7);
  for (let i = 0; i < 70; i++) {
    const x = random() * 512;
    const y = 30 + random() * 70;
    const r = 30 + random() * 70;
    for (const dx of [-512, 0, 512]) {
      const g = ctx.createRadialGradient(x + dx, y, 0, x + dx, y, r);
      g.addColorStop(0, "rgba(255,255,255,0.18)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x + dx - r, y - r, r * 2, r * 2);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}
