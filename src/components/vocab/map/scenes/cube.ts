import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  Points,
  PointsMaterial,
  Vector3,
  type Texture,
} from "three";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import { groups3d, paddedCloud3d, withoutOutliers3d } from "@/lib/vocab/map3d-model";
import { easeOutCubic, easeOutQuart, segment, type IntroKind } from "@/lib/vocab/map/intro";
import { extrasOf, fieldOf, groupsOf } from "@/lib/vocab/map-model";
import {
  colorVar,
  discTexture,
  disposeTree,
  fadeTree,
  glowTexture,
  HighlightLayer,
  radialTexture,
  setPoints,
  type GroupLabel,
  type Highlight,
  type SceneInput,
  type ViewScene,
} from "./common";

const DOT_SIZE = 0.11;
const MARK_SIZE = 0.21;
/** A ring around the dot of a term in many domains, in its other domain's colour. */
const RING_SIZE = 0.2;
/** Region fill opacity per canvas theme, and when its field is highlighted from the legend. */
const REGION_OPACITY = { dark: 0.16, light: 0.17 } as const;
const REGION_HIGHLIGHT = 0.34;

/** Faint dot grid on the three back walls of the cube (x, y, z = −1): a frame like a 3D chart, not data. */
function wallGrid(): BufferGeometry {
  const steps = 10;
  const positions: number[] = [];
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const u = -1 + (2 * i) / steps;
      const v = -1 + (2 * j) / steps;
      positions.push(-1, u, v, u, -1, v, u, v, -1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return geometry;
}

/**
 * "Kubus": every term at its UMAP 3D position inside a framed cube, with a
 * translucent hull per field or branch. Glowing points on the dark canvas,
 * crisp discs on the light one.
 */
export class CubeScene implements ViewScene {
  readonly root = new Group();
  private readonly frameLines = new LineSegments(new EdgesGeometry(new BoxGeometry(2, 2, 2)), new LineBasicMaterial({ transparent: true, opacity: 0.4 }));
  private readonly grid = new Points(wallGrid(), new PointsMaterial({ size: 0.014, transparent: true, opacity: 0.45, depthWrite: false }));
  private readonly dots = new Points(new BufferGeometry(), new PointsMaterial({ vertexColors: true, transparent: true, depthWrite: false, size: DOT_SIZE }));
  private readonly regions = new Group();
  private readonly ringTexture = radialTexture([[0, 0], [0.5, 0], [0.6, 1], [0.74, 1], [0.84, 0], [1, 0]]);
  private readonly rings = new Points(new BufferGeometry(), new PointsMaterial({ vertexColors: true, transparent: true, depthWrite: false, size: RING_SIZE }));
  /** Lines from a hovered or selected term in many domains to the middle of its other regions. */
  private readonly links = new Group();
  private readonly textures: Record<"dark" | "light", Texture> = { dark: glowTexture(), light: discTexture() };
  private readonly marks: Record<"dark" | "light", HighlightLayer>;
  private positions = new Map<string, Vector3>();
  private ids: string[] = [];
  private labels: GroupLabel[] = [];
  private regionMeshes: { fieldId: string; mesh: Mesh }[] = [];
  private theme: "dark" | "light" = "dark";
  /** Where the dots and rings belong, for the intro's bloom. */
  private settled: { dots: Float32Array; rings: Float32Array } | null = null;

  constructor() {
    this.dots.renderOrder = 3;
    this.marks = { dark: new HighlightLayer(this.textures.dark, MARK_SIZE), light: new HighlightLayer(this.textures.light, MARK_SIZE) };
    (this.rings.material as PointsMaterial).map = this.ringTexture;
    this.rings.renderOrder = 2;
    this.root.add(this.frameLines, this.grid, this.regions, this.links, this.rings, this.dots, this.marks.dark.root, this.marks.light.root);
  }

  build(input: SceneInput) {
    const { data, visible, domains, color, theme } = input;
    this.theme = theme;
    const material = this.dots.material as PointsMaterial;
    material.map = this.textures[theme];
    material.blending = theme === "dark" ? AdditiveBlending : NormalBlending;
    material.needsUpdate = true;
    (this.frameLines.material as LineBasicMaterial).color = color("var(--border-strong)");
    (this.grid.material as PointsMaterial).color = color("var(--muted)");
    this.marks.dark.root.visible = theme === "dark";
    this.marks.light.root.visible = theme === "light";

    const background = color("var(--surface)");
    const byField = new Map<string, Color>();
    this.positions = new Map();
    const colors: Color[] = [];
    for (const p of visible) {
      const at = data.coords.get(p.id);
      if (!at) continue;
      this.positions.set(p.id, new Vector3(...at));
      const field = fieldOf(p.domain_id, domains);
      const key = field?.id ?? "none";
      if (!byField.has(key)) byField.set(key, color(colorVar(field)));
      const c = (byField.get(key) as Color).clone();
      if (p.domain_source === "pending") c.lerp(background, 0.5);
      colors.push(c);
    }
    this.ids = [...this.positions.keys()];
    setPoints(this.dots, [...this.positions.values()], colors);

    // One term, many domains: a ring in the colour of its first other domain's field.
    const ringAt: Vector3[] = [];
    const ringColours: Color[] = [];
    for (const p of visible) {
      const at = this.positions.get(p.id);
      const extra = extrasOf(p).find((id) => domains.has(id));
      if (!at || !extra) continue;
      ringAt.push(at);
      ringColours.push(color(colorVar(fieldOf(extra, domains))));
    }
    setPoints(this.rings, ringAt, ringColours);
    (this.rings.material as PointsMaterial).blending = theme === "dark" ? AdditiveBlending : NormalBlending;
    this.settled = {
      dots: Float32Array.from((this.dots.geometry.getAttribute("position")?.array as Float32Array) ?? []),
      rings: Float32Array.from((this.rings.geometry.getAttribute("position")?.array as Float32Array) ?? []),
    };

    // Regions: a hull around each field's (or branch's) terms, like the 2D map.
    disposeTree(this.regions);
    this.regionMeshes = [];
    this.labels = [];
    for (const g of groups3d(visible, data.coords, input.level, domains)) {
      this.positions.set(`group:${g.group.id}`, new Vector3(...g.centre));
      this.labels.push({ key: `group:${g.group.id}`, text: g.group.name, priority: 950 });
      // Guests (terms of this group that sit elsewhere, but near) are wrapped too: the regions overlap there.
      const cloud = paddedCloud3d([...withoutOutliers3d(g.members), ...g.guests]).map((p) => new Vector3(p[0], p[1], p[2]));
      let geometry: ConvexGeometry;
      try {
        geometry = new ConvexGeometry(cloud);
      } catch {
        continue; // a degenerate cloud cannot be wrapped; its points are still drawn
      }
      const mesh = new Mesh(
        geometry,
        new MeshBasicMaterial({ color: color(colorVar(g.field)), transparent: true, opacity: REGION_OPACITY[theme], depthWrite: false, side: DoubleSide }),
      );
      mesh.renderOrder = 1;
      this.regions.add(mesh);
      this.regionMeshes.push({ fieldId: g.field.id, mesh });
    }
  }

  emphasize(fieldId: string | null) {
    for (const { fieldId: id, mesh } of this.regionMeshes) {
      (mesh.material as MeshBasicMaterial).opacity = id === fieldId ? REGION_HIGHLIGHT : REGION_OPACITY[this.theme];
    }
  }

  highlight(h: Highlight, input: SceneInput) {
    const colorOf = (id: string) => {
      const point = input.points.find((p) => p.id === id);
      return input.color(colorVar(fieldOf(point?.domain_id ?? null, input.domains)));
    };
    this.marks[input.theme].update(h, input, colorOf, (key) => this.positionOf(key));

    // A term in many domains, in focus: thin lines to the middle of its other regions.
    disposeTree(this.links);
    const ends: number[] = [];
    for (const id of new Set([h.selectedId, h.hoverId])) {
      const point = id ? input.points.find((p) => p.id === id) : undefined;
      const from = id ? this.positions.get(id) : undefined;
      if (!point || !from) continue;
      for (const group of groupsOf(point, input.level, input.domains).slice(1)) {
        const to = this.positions.get(`group:${group.id}`);
        if (to) ends.push(from.x, from.y, from.z, to.x, to.y, to.z);
      }
    }
    if (ends.length) {
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new Float32BufferAttribute(ends, 3));
      this.links.add(new LineSegments(geometry, new LineBasicMaterial({ color: input.color("var(--text)"), transparent: true, opacity: 0.55, depthWrite: false })));
    }
  }

  tick() {
    return false;
  }

  positionOf(key: string) {
    return this.positions.get(key) ?? null;
  }

  pickable() {
    return this.ids;
  }

  groupLabels() {
    return this.labels;
  }

  frame() {
    return { target: new Vector3(0, 0, 0), position: new Vector3(2.3, 1.5, 2.7) };
  }

  /**
   * Full: the frame grows out of the middle, then the terms bloom from the
   * middle to their places, and the regions fill in last. Short: a smaller
   * bloom.
   */
  intro(t: number, kind: IntroKind) {
    const full = kind === "full";
    // The whole cube turns in as the camera comes round, winding down through the intro.
    this.root.rotation.y = -(1 - easeOutQuart(t)) * (full ? 1.4 : 0.2);
    const frame = easeOutCubic(segment(t, 0, full ? 0.4 : 0.6));
    const from = full ? 0.001 : 0.85;
    this.frameLines.scale.setScalar(from + (1 - from) * frame);
    this.grid.scale.setScalar(from + (1 - from) * frame);
    const bloom = easeOutCubic(segment(t, full ? 0.18 : 0, full ? 0.85 : 1));
    const k = (full ? 0 : 0.8) + (full ? 1 : 0.2) * bloom;
    for (const [points, settled] of [
      [this.dots, this.settled?.dots],
      [this.rings, this.settled?.rings],
    ] as const) {
      const attribute = points.geometry.getAttribute("position");
      if (!attribute || !settled) continue;
      const array = attribute.array as Float32Array;
      for (let i = 0; i < settled.length; i++) array[i] = settled[i] * k;
      attribute.needsUpdate = true;
    }
    fadeTree(this.regions, segment(t, full ? 0.65 : 0.4, 1));
    fadeTree(this.rings, segment(t, full ? 0.55 : 0.3, 1));
  }

  dispose() {
    this.marks.dark.dispose();
    this.marks.light.dispose();
    disposeTree(this.root);
    this.textures.dark.dispose();
    this.textures.light.dispose();
    this.ringTexture.dispose();
  }
}
