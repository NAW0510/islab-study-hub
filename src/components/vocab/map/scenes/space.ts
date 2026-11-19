import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  LineLoop,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Texture,
} from "three";
import { mulberry32 } from "@/lib/vocab/layout/prng";
import { termGroups } from "@/lib/vocab/map3d-model";
import { extrasOf } from "@/lib/vocab/map-model";
import { easeOutCubic, segment, type IntroKind } from "@/lib/vocab/map/intro";
import { bodyPositions, closedSpline, routeControls, spaceLayout, type Body, type Route, type SpaceLayout } from "@/lib/vocab/space-model";
import {
  canvasTexture,
  colorVar,
  disposeTree,
  fieldLabels,
  glowTexture,
  HighlightLayer,
  radialTexture,
  setPoints,
  type FieldLabel,
  type GroupLabel,
  type Highlight,
  type SceneInput,
  type ViewScene,
} from "./common";

/**
 * Colours of physical things in the sky (hot gas, starlight, the void). They
 * are part of the picture, not of the interface, so they are not design tokens.
 */
const HOT = new Color("#ffd9a0");
const WHITE_HOT = new Color("#fff6e6");
const STARLIGHT = new Color("#fff1c9");
const ROCK = new Color("#8b7f72");

const SIZE = { planet: 0.12, moon: 0.07, rock: 0.065, mark: 0.22 } as const;
const UP = new Vector3(0, 0, 1);

// ── Textures ──────────────────────────────────────────────────────────────

/** A spiral galaxy: bright core, two arms of dust and stars. Drawn white; the material tints it. */
function galaxyTexture(): Texture {
  return canvasTexture(256, (g, s) => {
    const c = s / 2;
    const core = g.createRadialGradient(c, c, 0, c, c, c);
    core.addColorStop(0, "rgba(255,255,255,0.9)");
    core.addColorStop(0.12, "rgba(255,255,255,0.45)");
    core.addColorStop(0.5, "rgba(255,255,255,0.08)");
    core.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = core;
    g.fillRect(0, 0, s, s);
    const random = mulberry32(42);
    for (let i = 0; i < 2600; i++) {
      const arm = i % 2;
      const t = Math.pow(random(), 0.7);
      const angle = arm * Math.PI + t * 3.4 * Math.PI + (random() - 0.5) * 0.55;
      const r = (0.06 + 0.88 * t) * c * (0.92 + random() * 0.16);
      const x = c + Math.cos(angle) * r;
      const y = c + Math.sin(angle) * r;
      g.fillStyle = `rgba(255,255,255,${(0.08 + 0.35 * (1 - t)) * random()})`;
      g.beginPath();
      g.arc(x, y, 0.6 + random() * 1.6, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** Streaks of hot gas for the accretion disk; rotated over time to make it swirl. */
function swirlTexture(): Texture {
  return canvasTexture(256, (g, s) => {
    const c = s / 2;
    const random = mulberry32(7);
    g.fillStyle = "rgba(255,255,255,0.55)";
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 260; i++) {
      const r = c * (0.3 + 0.7 * random());
      const start = random() * Math.PI * 2;
      g.strokeStyle = `rgba(255,255,255,${0.25 + 0.75 * random()})`;
      g.lineWidth = 0.6 + random() * 2.2;
      g.beginPath();
      g.arc(c, c, r, start, start + 0.4 + random() * 1.6);
      g.stroke();
    }
  });
}

/** Thin bright ring with a soft halo: light bent around the black hole (photon ring). */
const photonRingTexture = () => radialTexture([[0, 0], [0.55, 0], [0.64, 0.5], [0.7, 1], [0.76, 0.45], [0.88, 0.08], [1, 0]], 128);

/** A ball lit from the upper left, drawn white so vertex colours tint it. */
function sphereTexture(): Texture {
  return canvasTexture(64, (g, s) => {
    const gradient = g.createRadialGradient(s * 0.36, s * 0.34, s * 0.04, s / 2, s / 2, s * 0.48);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.55, "rgba(200,200,200,1)");
    gradient.addColorStop(0.92, "rgba(95,95,95,1)");
    gradient.addColorStop(1, "rgba(60,60,60,0)");
    g.fillStyle = gradient;
    g.beginPath();
    g.arc(s / 2, s / 2, s * 0.48, 0, Math.PI * 2);
    g.fill();
  });
}

/** An irregular, lumpy rock. */
function rockTexture(): Texture {
  return canvasTexture(64, (g, s) => {
    const random = mulberry32(3);
    const gradient = g.createRadialGradient(s * 0.4, s * 0.38, 2, s / 2, s / 2, s * 0.45);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(1, "rgba(110,110,110,1)");
    g.fillStyle = gradient;
    g.beginPath();
    const corners = 11;
    for (let i = 0; i <= corners; i++) {
      const a = (i / corners) * Math.PI * 2;
      const r = s * (0.3 + 0.14 * random());
      const x = s / 2 + Math.cos(a) * r;
      const y = s / 2 + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.fill();
  });
}

/** A closed line along an orbit, in the orbit's own (parent-relative) coordinates. */
function orbitLoop(orbit: NonNullable<Body["orbit"]>, color: Color, opacity: number, segments = 64): LineLoop {
  const points: number[] = [];
  for (let k = 0; k < segments; k++) {
    const a = (k / segments) * Math.PI * 2;
    for (let axis = 0; axis < 3; axis++) points.push(orbit.radius * (Math.cos(a) * orbit.u[axis] + Math.sin(a) * orbit.w[axis]) + orbit.lift[axis]);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(points, 3));
  const loop = new LineLoop(geometry, new LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  loop.renderOrder = 5;
  return loop;
}

/** Plane-like mesh (normal +z) turned so its normal points along `normal`. */
function faceAlong(mesh: Mesh, normal: Vector3) {
  mesh.quaternion.copy(new Quaternion().setFromUnitVectors(UP, normal.clone().normalize()));
}

// ── Scene ─────────────────────────────────────────────────────────────────

type Kind = "planet" | "moon" | "rock";

/** Points along a bridge's dashed route. */
const ROUTE_SAMPLES = 160;

/**
 * "Luar angkasa": every field a galaxy around a black hole, every branch a
 * sun, every term a planet, moon or rock on its orbit. Always on the dark canvas.
 */
export class SpaceScene implements ViewScene {
  readonly root = new Group();
  /** Everything but the background stars, so the intro can grow it out of the dark. */
  private readonly content = new Group();
  private readonly stars: Points;
  private readonly sky = new Group();
  private readonly bodies: Record<Kind, Points>;
  private readonly marks: HighlightLayer;
  /** Orbit paths of the hovered and selected bodies, each riding along with the body it circles. */
  private readonly paths = new Group();
  private pathOwners: { parent: string; object: Group }[] = [];
  private readonly tex = {
    galaxy: galaxyTexture(),
    swirl: swirlTexture(),
    photon: photonRingTexture(),
    glow: glowTexture(),
    sphere: sphereTexture(),
    rock: rockTexture(),
  };
  private layout: SpaceLayout | null = null;
  private layoutFor: unknown = null;
  private order: Record<Kind, string[]> = { planet: [], moon: [], rock: [] };
  private movers: { key: string; object: Group }[] = [];
  private disks: Mesh[] = [];
  private galaxyDisks: { fieldId: string; mesh: Mesh }[] = [];
  private positions = new Map<string, Vector3>();
  private visibleIds: string[] = [];
  private visibleSet = new Set<string>();
  /** Galaxy names (and the no-domain cluster): ranked, see FIELD_LABELS. Sun names always show. */
  private galaxyLabels: FieldLabel[] = [];
  private sunLabels: GroupLabel[] = [];
  private focusFields = new Set<string | null>();
  /** Scene time of the last tick, so a rebuild keeps everything where it was. */
  private now = 0;
  private swirls: Texture[] = [];
  /** What the layout was computed from: the 3D data and every term's extra domains. */
  private extrasKey = "";
  /** The route of each visible term in many domains, redrawn as its suns move. */
  private routes: { hosts: string[]; route: Route; line: Line }[] = [];

  constructor() {
    // Background stars: decoration far behind everything.
    const random = mulberry32(2026);
    const stars: number[] = [];
    for (let i = 0; i < 1800; i++) {
      const u = random() * 2 - 1;
      const a = random() * Math.PI * 2;
      const r = 40 + random() * 30;
      const s = Math.sqrt(1 - u * u);
      stars.push(Math.cos(a) * s * r, u * r, Math.sin(a) * s * r);
    }
    const starGeometry = new BufferGeometry();
    starGeometry.setAttribute("position", new Float32BufferAttribute(stars, 3));
    this.stars = new Points(starGeometry, new PointsMaterial({ size: 1.4, sizeAttenuation: false, color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false }));

    const layer = (kind: Kind) => {
      const points = new Points(
        new BufferGeometry(),
        new PointsMaterial({ vertexColors: true, transparent: true, depthWrite: false, size: SIZE[kind], map: kind === "rock" ? this.tex.rock : this.tex.sphere, alphaTest: 0.05 }),
      );
      points.renderOrder = 4;
      return points;
    };
    this.bodies = { planet: layer("planet"), moon: layer("moon"), rock: layer("rock") };
    this.marks = new HighlightLayer(this.tex.glow, SIZE.mark);
    this.content.add(this.sky, this.paths, this.bodies.planet, this.bodies.moon, this.bodies.rock, this.marks.root);
    this.root.add(this.stars, this.content);
  }

  build(input: SceneInput) {
    const { data, points, visible, domains, color } = input;

    // The layout depends on all terms (not on the week slider or legend), so it stays put while they change.
    const extrasKey = points.map((p) => (extrasOf(p).length ? `${p.id}:${extrasOf(p).join(",")}` : "")).join("|");
    if (this.layoutFor !== data || this.extrasKey !== extrasKey || !this.layout) {
      const terms = points
        .filter((p) => data.coords.has(p.id))
        .map((p) => ({
          id: p.id,
          ...termGroups(p.domain_id, domains),
          at: data.coords.get(p.id) as [number, number, number],
          // One term, many domains: a bridge between the suns of all its domains.
          extras: extrasOf(p).flatMap((id) => {
            const g = termGroups(id, domains);
            return g.fieldId && g.branchKey ? [{ fieldId: g.fieldId, branchKey: g.branchKey }] : [];
          }),
        }));
      this.layout = spaceLayout(terms, data.roles);
      this.layoutFor = data;
      this.extrasKey = extrasKey;
    }
    const layout = this.layout;
    const shown = new Set(visible.map((p) => p.id));
    const bodies = layout.bodies;
    const byKey = new Map(bodies.map((b) => [b.key, b]));

    // Which suns and galaxies have something visible.
    const liveSuns = new Set<string>();
    const liveFields = new Map<string, number>();
    for (const b of bodies) {
      if (!b.termId || !shown.has(b.termId)) continue;
      let parent = b.parent ? byKey.get(b.parent) : undefined;
      while (parent && parent.kind !== "sun" && parent.parent) parent = byKey.get(parent.parent);
      if (parent?.kind === "sun") liveSuns.add(parent.key);
      if (b.fieldId) liveFields.set(b.fieldId, (liveFields.get(b.fieldId) ?? 0) + 1);
      // A bridge lights every sun (and galaxy) it loops around.
      for (const host of b.hosts ?? []) {
        const h = byKey.get(host);
        if (h?.kind === "sun") liveSuns.add(h.key);
        if (h?.fieldId && !liveFields.has(h.fieldId)) liveFields.set(h.fieldId, 0);
      }
    }

    disposeTree(this.sky);
    for (const texture of this.swirls) texture.dispose();
    this.swirls = [];
    this.movers = [];
    this.disks = [];
    this.galaxyDisks = [];
    this.galaxyLabels = [];
    this.sunLabels = [];
    this.positions = new Map();

    for (const galaxy of layout.galaxies) {
      if (!galaxy.fieldId || !liveFields.has(galaxy.fieldId)) continue;
      const field = domains.get(galaxy.fieldId) ?? null;
      const tint = color(colorVar(field));
      const normal = new Vector3(...galaxy.normal);
      const centre = new Vector3(...galaxy.centre);
      const hole = byKey.get(`hole:${galaxy.fieldId}`) as Body;
      const r = hole.size;

      // Galaxy disk: dust and stars in the field's colour.
      const disk = new Mesh(
        new PlaneGeometry(galaxy.radius * 2.5, galaxy.radius * 2.5),
        new MeshBasicMaterial({ map: this.tex.galaxy, color: tint, transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
      );
      disk.position.copy(centre);
      faceAlong(disk, normal);
      disk.renderOrder = 1;
      this.sky.add(disk);
      this.galaxyDisks.push({ fieldId: galaxy.fieldId, mesh: disk });

      // Black hole: an event horizon that hides what is behind it, a photon ring, and a swirling accretion disk.
      const horizon = new Mesh(new SphereGeometry(r, 40, 24), new MeshBasicMaterial({ color: 0x000000 }));
      horizon.position.copy(centre);
      horizon.renderOrder = 0;
      this.sky.add(horizon);

      const accretion = new RingGeometry(r * 1.7, r * 4.4, 128, 2);
      const vertices = accretion.getAttribute("position");
      const colors: number[] = [];
      const hot = HOT.clone().lerp(tint, 0.35);
      for (let i = 0; i < vertices.count; i++) {
        const x = vertices.getX(i);
        const y = vertices.getY(i);
        const t = (Math.hypot(x, y) - r * 1.7) / (r * 2.7);
        // Doppler beaming: the side moving towards us is brighter. Inner gas is hotter.
        const beam = 0.4 + 0.6 * (0.5 + 0.5 * Math.cos(Math.atan2(y, x)));
        const c = WHITE_HOT.clone().lerp(hot, Math.min(1, t * 1.4)).multiplyScalar(beam * (1 - 0.55 * t));
        colors.push(c.r, c.g, c.b);
      }
      accretion.setAttribute("color", new Float32BufferAttribute(colors, 3));
      const swirl = this.tex.swirl.clone();
      swirl.center.set(0.5, 0.5);
      swirl.needsUpdate = true;
      this.swirls.push(swirl);
      const ring = new Mesh(
        accretion,
        new MeshBasicMaterial({ map: swirl, vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
      );
      ring.position.copy(centre);
      faceAlong(ring, normal);
      ring.renderOrder = 2;
      this.sky.add(ring);
      this.disks.push(ring);

      const photon = new Sprite(new SpriteMaterial({ map: this.tex.photon, color: WHITE_HOT, transparent: true, blending: AdditiveBlending, depthWrite: false }));
      photon.scale.setScalar(r * 3.4);
      photon.position.copy(centre);
      photon.renderOrder = 3;
      this.sky.add(photon);
      const halo = new Sprite(new SpriteMaterial({ map: this.tex.glow, color: hot, transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false }));
      halo.scale.setScalar(r * 11);
      halo.position.copy(centre);
      halo.renderOrder = 1;
      this.sky.add(halo);

      this.positions.set(hole.key, centre);
      this.positions.set(`label:${hole.key}`, centre.clone().addScaledVector(normal, galaxy.radius * 0.42));
      const count = liveFields.get(galaxy.fieldId) ?? 0;
      this.galaxyLabels.push({ key: `label:${hole.key}`, text: field?.name ?? "Bidang", priority: 950, fieldId: galaxy.fieldId, count });
    }

    // Suns (with the orbits of their planets) and the loose cluster of terms without a domain.
    for (const sun of bodies.filter((b) => b.kind === "sun" && liveSuns.has(b.key))) {
      const field = sun.fieldId ? (domains.get(sun.fieldId) ?? null) : null;
      const light = STARLIGHT.clone().lerp(color(colorVar(field)), 0.3);
      const group = new Group();
      const core = new Mesh(new SphereGeometry(sun.size, 24, 16), new MeshBasicMaterial({ color: STARLIGHT }));
      const corona = new Sprite(new SpriteMaterial({ map: this.tex.glow, color: light, transparent: true, blending: AdditiveBlending, depthWrite: false }));
      corona.scale.setScalar(sun.size * 9);
      corona.renderOrder = 3;
      group.add(core, corona);
      for (const planet of bodies.filter((b) => b.kind === "planet" && b.parent === sun.key && b.termId && shown.has(b.termId))) {
        const loop = orbitLoop(planet.orbit as NonNullable<Body["orbit"]>, light, 0.16);
        loop.renderOrder = 2;
        group.add(loop);
      }
      this.sky.add(group);
      this.movers.push({ key: sun.key, object: group });
      const name = sun.branchKey?.endsWith(":umum") ? "Umum" : (domains.get(sun.branchKey ?? "")?.name ?? "");
      this.sunLabels.push({ key: sun.key, text: name, priority: 700 });
    }
    if (visible.some((p) => !termGroups(p.domain_id, domains).fieldId)) {
      const cluster = layout.galaxies.find((g) => g.fieldId === null);
      if (cluster) {
        const dust = new Sprite(new SpriteMaterial({ map: this.tex.glow, color: color("var(--domain-none)"), transparent: true, opacity: 0.25, blending: AdditiveBlending, depthWrite: false }));
        dust.scale.setScalar(cluster.radius * 2.2);
        dust.position.set(...cluster.centre);
        this.sky.add(dust);
        this.positions.set("label:cluster:none", new Vector3(...cluster.centre).add(new Vector3(0, cluster.radius * 0.8, 0)));
        this.galaxyLabels.push({ key: "label:cluster:none", text: "Tanpa domain", priority: 900, fieldId: null, count: 0 });
      }
    }

    // Terms: one point layer per kind, coloured by field (moons greyer, rocks stony).
    const colorsOf: Record<Kind, Color[]> = { planet: [], moon: [], rock: [] };
    this.order = { planet: [], moon: [], rock: [] };
    const grey = color("var(--muted)");
    for (const b of bodies) {
      if (!b.termId || !shown.has(b.termId)) continue;
      const kind = b.kind as Kind;
      const tint = color(colorVar(b.fieldId ? (domains.get(b.fieldId) ?? null) : null));
      this.order[kind].push(b.termId);
      colorsOf[kind].push(kind === "planet" ? tint : kind === "moon" ? tint.clone().lerp(grey, 0.5) : ROCK.clone().lerp(tint, 0.25));
    }
    for (const kind of ["planet", "moon", "rock"] as const) {
      setPoints(this.bodies[kind], this.order[kind].map(() => [0, 0, 0]), colorsOf[kind]);
    }
    this.visibleIds = [...this.order.planet, ...this.order.moon, ...this.order.rock];
    this.visibleSet = new Set(this.visibleIds);

    // Routes of the bridges: a dashed loop, each petal in the colour of the field it goes around.
    this.routes = [];
    for (const b of bodies) {
      if (!b.hosts || !b.route || !b.termId || !shown.has(b.termId)) continue;
      const tints = b.hosts.map((h) => {
        const host = byKey.get(h);
        return color(colorVar(host?.fieldId ? (domains.get(host.fieldId) ?? null) : null)).lerp(STARLIGHT, 0.35);
      });
      const colours: number[] = [];
      for (let i = 0; i <= ROUTE_SAMPLES; i++) {
        const c = tints[Math.min(tints.length - 1, Math.floor((i / ROUTE_SAMPLES) * tints.length))];
        colours.push(c.r, c.g, c.b);
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new Float32BufferAttribute(new Float32Array((ROUTE_SAMPLES + 1) * 3), 3));
      geometry.setAttribute("color", new Float32BufferAttribute(colours, 3));
      const line = new Line(geometry, new LineDashedMaterial({ vertexColors: true, dashSize: 0.035, gapSize: 0.025, transparent: true, opacity: 0.75, depthWrite: false }));
      line.renderOrder = 3;
      line.frustumCulled = false;
      this.sky.add(line);
      this.routes.push({ hosts: b.hosts, route: b.route, line });
    }
    this.place(this.now);
  }

  /** Moves everything to its position at scene time `t`. */
  private place(t: number) {
    if (!this.layout) return;
    const at = bodyPositions(this.layout, t);
    for (const [key, p] of at) {
      const v = this.positions.get(key);
      if (v) v.set(p[0], p[1], p[2]);
      else this.positions.set(key, new Vector3(p[0], p[1], p[2]));
    }
    for (const kind of ["planet", "moon", "rock"] as const) {
      const attribute = this.bodies[kind].geometry.getAttribute("position");
      if (!attribute) continue;
      this.order[kind].forEach((id, i) => {
        const p = at.get(id);
        if (p) attribute.setXYZ(i, p[0], p[1], p[2]);
      });
      attribute.needsUpdate = true;
      this.bodies[kind].geometry.computeBoundingSphere();
    }
    for (const { key, object } of this.movers) {
      const p = at.get(key);
      if (p) object.position.set(p[0], p[1], p[2]);
    }
    for (const { parent, object } of this.pathOwners) {
      const p = at.get(parent);
      if (p) object.position.set(p[0], p[1], p[2]);
    }
    // The routes follow their suns, which orbit their galaxies.
    for (const { hosts, route, line } of this.routes) {
      const ends = hosts.map((h) => at.get(h));
      if (!ends.every((e): e is [number, number, number] => Boolean(e))) continue;
      const controls = routeControls(ends, route.normal);
      const attribute = line.geometry.getAttribute("position");
      for (let i = 0; i <= ROUTE_SAMPLES; i++) {
        const p = closedSpline(controls, i / ROUTE_SAMPLES);
        attribute.setXYZ(i, p[0], p[1], p[2]);
      }
      attribute.needsUpdate = true;
      line.computeLineDistances();
    }
  }

  tick(seconds: number, delta: number) {
    if (!this.layout || (delta === 0 && seconds === this.now)) return false;
    this.now = seconds;
    this.place(seconds);
    for (const disk of this.disks) {
      const map = (disk.material as MeshBasicMaterial).map;
      if (map) map.rotation -= delta * 0.5;
    }
    this.marks.follow((key) => this.positionOf(key));
    return true;
  }

  highlight(h: Highlight, input: SceneInput) {
    const colorOf = (id: string) => {
      const point = input.points.find((p) => p.id === id);
      return input.color(colorVar(point ? (input.domains.get(termGroups(point.domain_id, input.domains).fieldId ?? "") ?? null) : null));
    };
    this.marks.update(h, { ...input, theme: "dark" }, colorOf, (key) => this.positionOf(key));

    this.focusFields = new Set();
    for (const id of [h.selectedId, h.hoverId]) {
      const point = id ? input.points.find((p) => p.id === id) : undefined;
      if (point) this.focusFields.add(termGroups(point.domain_id, input.domains).fieldId);
    }

    // The path each highlighted body travels: brighter for the selected one.
    disposeTree(this.paths);
    this.pathOwners = [];
    const bodies = new Map((this.layout?.bodies ?? []).map((b) => [b.key, b]));
    const wanted = [
      { id: h.selectedId, opacity: 0.9 },
      { id: h.hoverId !== h.selectedId ? h.hoverId : null, opacity: 0.55 },
    ];
    for (const { id, opacity } of wanted) {
      const body = id ? bodies.get(id) : undefined;
      if (!body?.orbit || !body.parent || !this.visibleSet.has(body.key)) continue;
      const tint = colorOf(body.key).clone().lerp(WHITE_HOT, 0.45);
      const group = new Group();
      group.add(orbitLoop(body.orbit, tint, opacity, 128));
      // A moon's planet also travels: show that path too, fainter, so the moon's motion reads.
      const parent = bodies.get(body.parent);
      if (body.kind === "moon" && parent?.orbit && parent.parent) {
        const outer = new Group();
        outer.add(orbitLoop(parent.orbit, tint, opacity * 0.45, 128));
        this.paths.add(outer);
        this.pathOwners.push({ parent: parent.parent, object: outer });
      }
      this.paths.add(group);
      this.pathOwners.push({ parent: body.parent, object: group });
    }
    const at = this.layout ? bodyPositions(this.layout, this.now) : new Map();
    for (const { parent, object } of this.pathOwners) {
      const p = at.get(parent);
      if (p) object.position.set(p[0], p[1], p[2]);
    }
  }

  emphasize(fieldId: string | null) {
    for (const { fieldId: id, mesh } of this.galaxyDisks) {
      (mesh.material as MeshBasicMaterial).opacity = fieldId === null ? 0.5 : id === fieldId ? 0.95 : 0.25;
    }
  }

  positionOf(key: string) {
    if (key.startsWith("label:") || key.startsWith("hole:") || key.startsWith("sun:") || this.visibleSet.has(key)) return this.positions.get(key) ?? null;
    return null;
  }

  pickable() {
    return this.visibleIds;
  }

  groupLabels() {
    return [...fieldLabels(this.galaxyLabels, this.focusFields), ...this.sunLabels];
  }

  /**
   * Full: the stars come out of the black one by one, then the galaxies,
   * tiny and far, grow slowly while turning a quarter of a spiral, and the
   * bodies light up. Short: a small grow and fade.
   */
  intro(t: number, kind: IntroKind) {
    const full = kind === "full";
    const grow = easeOutCubic(segment(t, full ? 0.14 : 0, 1));
    const from = full ? 0.035 : 0.86;
    this.content.scale.setScalar(from + (1 - from) * grow);
    this.content.rotation.y = (1 - grow) * (full ? 1.7 : 0.25);
    (this.stars.material as PointsMaterial).opacity = 0.75 * segment(t, 0, full ? 0.45 : 0.3);
    const light = segment(t, full ? 0.3 : 0, full ? 0.75 : 0.5);
    for (const kindOf of ["planet", "moon", "rock"] as const) (this.bodies[kindOf].material as PointsMaterial).opacity = light;
  }

  frame() {
    const radius = this.layout?.radius ?? 3;
    return { target: new Vector3(0, 0, 0), position: new Vector3(1, 0.75, 1.25).normalize().multiplyScalar(radius * 2.2) };
  }

  dispose() {
    this.marks.dispose();
    disposeTree(this.root);
    this.pathOwners = [];
    for (const texture of [...Object.values(this.tex), ...this.swirls]) texture.dispose();
  }
}

