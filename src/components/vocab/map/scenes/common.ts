import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  NormalBlending,
  Object3D,
  Points,
  PointsMaterial,
  SRGBColorSpace,
  Vector3,
  type Material,
  type Texture,
} from "three";
import type { VocabDomain } from "@/lib/types";
import type { Layout3dData } from "@/lib/vocab/map3d-model";
import type { BoundaryLevel, MapPoint } from "@/lib/vocab/map-model";
import { asDomainColor } from "@/lib/vocab/seed-domains";

/** The three looks of the 3D brain map. */
export type View3d = "space" | "brain" | "cube";
export type Theme = "dark" | "light";

/** Everything a scene is built from; it is rebuilt when any of it changes. */
export type SceneInput = {
  data: Layout3dData;
  /** All terms (for counts) and the ones that pass the week slider and legend. */
  points: readonly MapPoint[];
  visible: readonly MapPoint[];
  domains: ReadonlyMap<string, VocabDomain>;
  /** A CSS colour (usually a design token) resolved in the canvas's own theme. */
  color: (css: string) => Color;
  theme: Theme;
  level: BoundaryLevel;
};

export type Highlight = {
  selectedId: string | null;
  hoverId: string | null;
  /** Nearest terms of the selected one, with cosine similarity (from the detail panel). */
  neighbours: readonly { id: string; similarity: number }[];
};

/** A name drawn over the scene at the position of `key` (a group, galaxy, sun or lobe). */
export type GroupLabel = { key: string; text: string; priority: number };

/**
 * One look of the 3D map. The shell owns the renderer, camera, input, labels
 * and panels; a scene owns what is drawn and where every term is.
 */
export interface ViewScene {
  readonly root: Object3D;
  build(input: SceneInput): void;
  /** Selected/hovered marks and neighbour lines. */
  highlight(h: Highlight, input: SceneInput): void;
  /** Stronger look for one field (legend hover); null to reset. */
  emphasize(fieldId: string | null, input: SceneInput): void;
  /** Advances animation to `seconds` of scene time; returns true when something moved. */
  tick(seconds: number, delta: number): boolean;
  /** Current position of a term id or a group key; null when it is not drawn. */
  positionOf(key: string): Vector3 | null;
  /** Ids of the terms that can be hovered and picked. */
  pickable(): readonly string[];
  groupLabels(): readonly GroupLabel[];
  /** Where the camera looks from at the start and after "Kembali ke awal". */
  frame(): { target: Vector3; position: Vector3 };
  dispose(): void;
}

export const colorVar = (domain: VocabDomain | null) => (domain ? `var(--${asDomainColor(domain.color)})` : "var(--domain-none)");

/** Frees every geometry, material and texture under `object`, and empties it. */
export function disposeTree(object: Object3D) {
  object.traverse((child) => {
    const mesh = child as Object3D & { geometry?: BufferGeometry; material?: Material | Material[] };
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of materials) m.dispose();
  });
  for (const child of [...object.children]) object.remove(child);
}

/** A texture drawn on a small canvas. */
export function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, size: number) => void): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext("2d") as CanvasRenderingContext2D, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Radial gradient sprite; `stops` are [offset 0…1, alpha]. */
export function radialTexture(stops: readonly [number, number][], size = 64): Texture {
  return canvasTexture(size, (g, s) => {
    const gradient = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    for (const [at, alpha] of stops) gradient.addColorStop(at, `rgba(255,255,255,${alpha})`);
    g.fillStyle = gradient;
    g.fillRect(0, 0, s, s);
  });
}

/** Soft glow (dark canvas) or a crisp disc with a soft rim (light canvas). */
export const glowTexture = () => radialTexture([[0, 1], [0.22, 0.95], [0.45, 0.35], [1, 0]]);
export const discTexture = () => radialTexture([[0, 1], [0.62, 1], [0.8, 0.35], [1, 0]]);

export function setPoints(points: Points, positions: readonly Vector3[] | readonly (readonly number[])[], colors?: readonly Color[]) {
  const pos = new Float32Array(positions.length * 3);
  positions.forEach((p, i) => {
    if (p instanceof Vector3) pos.set([p.x, p.y, p.z], i * 3);
    else pos.set(p as number[], i * 3);
  });
  points.geometry.setAttribute("position", new Float32BufferAttribute(pos, 3));
  if (colors) {
    const col = new Float32Array(colors.length * 3);
    colors.forEach((c, i) => col.set([c.r, c.g, c.b], i * 3));
    points.geometry.setAttribute("color", new Float32BufferAttribute(col, 3));
  }
  points.geometry.computeBoundingSphere();
}

/**
 * Selected and hovered terms drawn larger on top, and lines from the selected
 * term to its nearest neighbours (stronger for more similar ones). Follows the
 * terms when they move.
 */
export class HighlightLayer {
  readonly root = new Group();
  private readonly marks: Points;
  private readonly lines = new Group();
  private ids: string[] = [];
  private links: { id: string; line: Line }[] = [];
  private from: string | null = null;

  constructor(private readonly texture: Texture, size: number) {
    this.marks = new Points(new BufferGeometry(), new PointsMaterial({ vertexColors: true, transparent: true, depthWrite: false, size, map: texture }));
    this.marks.renderOrder = 6;
    this.root.add(this.lines, this.marks);
  }

  update(h: Highlight, input: SceneInput, colorOf: (id: string) => Color, positionOf: (key: string) => Vector3 | null) {
    const blend = input.theme === "dark" ? AdditiveBlending : NormalBlending;
    const material = this.marks.material as PointsMaterial;
    material.blending = blend;
    material.needsUpdate = true;

    this.ids = [h.selectedId, h.hoverId].filter((id, i, all): id is string => Boolean(id) && all.indexOf(id) === i && positionOf(id as string) !== null);
    const towards = new Color(input.theme === "dark" ? 0xffffff : 0x000000);
    setPoints(
      this.marks,
      this.ids.map((id) => positionOf(id) as Vector3),
      this.ids.map((id) => colorOf(id).clone().lerp(towards, 0.3)),
    );

    disposeTree(this.lines);
    this.links = [];
    this.from = h.selectedId && positionOf(h.selectedId) ? h.selectedId : null;
    if (this.from) {
      const ink = input.color("var(--text)");
      for (const n of h.neighbours) {
        if (!positionOf(n.id)) continue;
        const s = Math.max(0, Math.min(1, n.similarity));
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(6), 3));
        const line = new Line(geometry, new LineBasicMaterial({ color: ink, transparent: true, opacity: 0.15 + 0.6 * s }));
        line.renderOrder = 5;
        this.lines.add(line);
        this.links.push({ id: n.id, line });
      }
    }
    this.follow(positionOf);
  }

  /** Moves the marks and line ends to where their terms are now. */
  follow(positionOf: (key: string) => Vector3 | null) {
    const attribute = this.marks.geometry.getAttribute("position");
    if (attribute) {
      this.ids.forEach((id, i) => {
        const p = positionOf(id);
        if (p) attribute.setXYZ(i, p.x, p.y, p.z);
      });
      attribute.needsUpdate = true;
    }
    const from = this.from ? positionOf(this.from) : null;
    for (const { id, line } of this.links) {
      const to = positionOf(id);
      const position = line.geometry.getAttribute("position");
      if (!from || !to) continue;
      position.setXYZ(0, from.x, from.y, from.z);
      position.setXYZ(1, to.x, to.y, to.z);
      position.needsUpdate = true;
      line.geometry.computeBoundingSphere();
    }
  }

  dispose() {
    disposeTree(this.root);
  }
}
