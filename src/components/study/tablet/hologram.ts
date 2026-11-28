import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TABLET_CONFIG } from "@/lib/study/tablet/config";
import type { VocabDomain } from "@/lib/types";
import { placeLabels } from "@/lib/vocab/labels";
import { INTRO_MS } from "@/lib/vocab/map/intro";
import { pickNearest, type Layout3dData, type Projected } from "@/lib/vocab/map3d-model";
import type { BoundaryLevel, MapPoint } from "@/lib/vocab/map-model";
import type { Highlight, SceneInput, Theme, ViewScene } from "../../vocab/map/scenes/common";
import { viewDefinition, type View3d } from "../../vocab/map/scenes/registry";

/**
 * The tablet's 3D hologram: the Peta Otak 3D's own views (Luar angkasa,
 * Otak, Kubus; scenes/registry.ts), the same scenes the full screen draws,
 * standing above the tablet.
 *
 * It keeps an orbit camera of its own, driven by the same OrbitControls as
 * the full screen (drag to turn, wheel or pinch to zoom, right drag to pan,
 * "Putar otomatis"), and the hologram is turned so that the tablet's camera
 * sees it as that orbit camera sees the view: turning the hologram turns
 * it, not the room. Zoom is the orbit's distance; the tablet moves its own
 * camera by that share towards the hologram (tablet.ts), so the tablet
 * leans in with it.
 *
 * Drawn in a second pass over the tablet (its colours are written the way
 * the full screen writes them), with its labels as HTML over the canvas, as
 * in full screen. Numbers: lib/study/tablet/config.ts (`hologram`).
 */

const { hologram: HOLO } = TABLET_CONFIG;

export type HologramInput = {
  view: View3d;
  data: Layout3dData;
  points: readonly MapPoint[];
  visible: readonly MapPoint[];
  domains: ReadonlyMap<string, VocabDomain>;
  theme: Theme;
  level: BoundaryLevel;
};

type LabelSpec = { key: string; text: string; priority: number; group: boolean; opacity?: number };
type Pose = { target: THREE.Vector3; position: THREE.Vector3 };

const UP = new THREE.Vector3(0, 1, 0);
const NEWEST = 12;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * The full screen's far backdrop (Luar angkasa's stars: points of a fixed
 * pixel size, round everything) would fill the whole room around the
 * tablet; the hologram leaves it out.
 */
function hideBackdrop(root: THREE.Object3D) {
  root.traverse((child) => {
    const material = (child as THREE.Points).material;
    if (child instanceof THREE.Points && material instanceof THREE.PointsMaterial && !material.sizeAttenuation) child.visible = false;
  });
}

export class Hologram {
  readonly scene = new THREE.Scene();
  /** Where it stands; grows out of the tablet's screen. */
  private readonly stand = new THREE.Group();
  /** Turned so the tablet's camera sees the view as the orbit camera does. */
  private readonly pivot = new THREE.Group();
  /** Puts the orbit's target on the stand. */
  private readonly offset = new THREE.Group();
  private readonly orbit = new THREE.PerspectiveCamera(HOLO.FULL_FOV, 1, 0.01, 200);
  private readonly controls: OrbitControls;
  /** How the tablet's camera looks at the stand when it rests (the hologram's front). */
  private readonly look = new THREE.Quaternion();
  private readonly centre = new THREE.Vector3(...HOLO.CENTER);
  private readonly probe: HTMLSpanElement;
  private readonly layer: HTMLDivElement;
  /**
   * The view drawn: its scene, its framing distance, whether its shaders are
   * ready, and when it first showed (it grows out of the screen and plays its
   * short intro from then).
   */
  private current: { view: View3d; scene: ViewScene; distance: number; compiled: boolean; shown: number; introAt: number } | null = null;
  private input: SceneInput | null = null;
  private state: Highlight = { selectedId: null, hoverId: null, neighbours: [] };
  private emphasized: string | null = null;
  private autoRotate = true;
  /** Scene time (orbits); runs only while things may move. */
  private time = 0;
  private clock = 0;
  private flight: { from: Pose; to: Pose; start: number } | null = null;
  /** Where the orbit was before a term pulled it in, to go back when the term is let go. */
  private before: Pose | null = null;
  private pendingFocus: string | null = null;
  private specs: LabelSpec[] = [];
  private readonly labels = new Map<string, { el: HTMLSpanElement; width: number; height: number }>();
  private readonly sizes = new WeakMap<THREE.PointsMaterial, { base: number; set: number }>();
  private readonly faded = new Map<THREE.Material, number>();

  constructor(canvas: HTMLCanvasElement, host: HTMLElement, restFrom: THREE.Vector3) {
    this.scene.add(this.stand);
    this.stand.add(this.pivot);
    this.pivot.add(this.offset);
    this.stand.position.copy(this.centre);
    this.stand.visible = false;
    this.look.setFromRotationMatrix(new THREE.Matrix4().lookAt(restFrom, this.centre, UP));

    this.controls = new OrbitControls(this.orbit, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enabled = false;
    // Turning by hand takes over from a flight.
    this.controls.addEventListener("start", () => {
      this.flight = null;
    });

    this.probe = document.createElement("span");
    this.probe.setAttribute("aria-hidden", "true");
    this.probe.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
    host.appendChild(this.probe);
    this.layer = document.createElement("div");
    this.layer.className = "tablet-labels";
    this.layer.setAttribute("aria-hidden", "true");
    host.appendChild(this.layer);
  }

  /** A design token (or any CSS colour) in the overlay's scheme, as the full screen reads them. */
  private readonly resolve = (css: string) => {
    this.probe.style.color = "";
    this.probe.style.color = css;
    const color = new THREE.Color();
    try {
      color.setStyle(getComputedStyle(this.probe).color);
    } catch {
      color.set(0x888888);
    }
    return color;
  };

  get view(): View3d | null {
    return this.current?.view ?? null;
  }

  /** Builds the view (or swaps to another one); colours are read now, in the overlay's scheme. */
  set(input: HologramInput, renderer: THREE.WebGLRenderer, camera: THREE.Camera) {
    const sceneInput: SceneInput = { data: input.data, points: input.points, visible: input.visible, domains: input.domains, color: this.resolve, theme: input.theme, level: input.level };
    this.input = sceneInput;
    let current = this.current;
    if (!current || current.view !== input.view) {
      if (current) {
        this.offset.remove(current.scene.root);
        current.scene.dispose();
      }
      const scene = viewDefinition(input.view).create();
      this.offset.add(scene.root);
      scene.build(sceneInput);
      hideBackdrop(scene.root);
      const frame = scene.frame();
      const distance = frame.position.distanceTo(frame.target);
      current = { view: input.view, scene, distance, compiled: false, shown: Infinity, introAt: Infinity };
      this.current = current;
      this.orbit.position.copy(frame.position);
      this.controls.target.copy(frame.target);
      this.controls.minDistance = distance * HOLO.ZOOM_MIN;
      this.controls.maxDistance = distance * HOLO.ZOOM_MAX;
      this.controls.autoRotateSpeed = viewDefinition(input.view).autoRotateSpeed;
      this.controls.update();
      this.controls.saveState();
      this.flight = null;
      this.before = null;
      scene.intro?.(0, "short");
      // Shaders first, then the view grows out of the screen (no stall on its first frame).
      const space = renderer.outputColorSpace;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.stand.visible = true;
      const compiled = renderer.compileAsync(this.scene, camera).catch(() => undefined);
      renderer.outputColorSpace = space;
      const born = current;
      void compiled.then(() => {
        born.compiled = true;
      });
    } else {
      current.scene.build(sceneInput);
    }
    hideBackdrop(current.scene.root);
    current.scene.highlight(this.state, sceneInput);
    if (this.emphasized) current.scene.emphasize(this.emphasized, sceneInput);
    if (this.pendingFocus && this.state.selectedId === this.pendingFocus) this.focus(this.pendingFocus);
    this.refreshLabels();
  }

  /** The term the pointer is over (null: none). */
  setHover(id: string | null) {
    if (this.state.hoverId === id) return;
    this.state = { ...this.state, hoverId: id };
    this.applyHighlight();
  }

  /** The picked term: the orbit flies to it (as in full screen); letting it go flies back. */
  setSelected(id: string | null) {
    if (this.state.selectedId === id) return;
    const had = this.state.selectedId;
    this.state = { ...this.state, selectedId: id, neighbours: [] };
    this.applyHighlight();
    if (id) {
      if (!had) this.before = { target: this.controls.target.clone(), position: this.orbit.position.clone() };
      this.focus(id);
    } else {
      this.pendingFocus = null;
      if (this.before) this.fly(this.before);
      this.before = null;
    }
  }

  /** The picked term's nearest terms (with similarity), for the lines to them. */
  setNeighbours(id: string, list: readonly { id: string; similarity: number }[]) {
    if (this.state.selectedId !== id) return;
    this.state = { ...this.state, neighbours: list };
    this.applyHighlight();
  }

  /** A field stands out (legend hover); null to reset. */
  emphasize(fieldId: string | null) {
    this.emphasized = fieldId;
    if (this.current && this.input) this.current.scene.emphasize(fieldId, this.input);
  }

  setAutoRotate(on: boolean) {
    this.autoRotate = on;
  }

  /** Back to the view's own framing ("Kembali ke tampilan awal"). */
  reset() {
    if (!this.current) return;
    this.flight = null;
    this.before = null;
    this.controls.reset();
  }

  /** For the dev probe (window.__tablet). */
  stats() {
    const current = this.current;
    if (!current) return null;
    let labels = 0;
    for (const { el } of this.labels.values()) if (el.style.visibility === "visible") labels++;
    return {
      view: current.view,
      shown: Number.isFinite(current.shown),
      visible: this.stand.visible,
      labels,
      autoRotate: this.controls.autoRotate,
      distance: Number(this.orbit.position.distanceTo(this.controls.target).toFixed(3)),
      selected: this.state.selectedId,
      neighbours: this.state.neighbours.length,
    };
  }

  ids(): string[] {
    return [...(this.current?.scene.pickable() ?? [])];
  }

  /** A term's name and, where the view gives one, its role there (a planet, a moon…). */
  describe(id: string): { label: string; detail: string | null } | null {
    const point = this.input?.points.find((p) => p.id === id);
    if (!point || !this.current || !this.input) return null;
    const describe = viewDefinition(this.current.view).describe;
    return { label: point.term, detail: describe ? describe(id, this.input.data, new Map(this.input.points.map((p) => [p.id, p]))) : null };
  }

  private applyHighlight() {
    if (this.current && this.input) this.current.scene.highlight(this.state, this.input);
    this.refreshLabels();
  }

  private focus(id: string) {
    const at = this.current?.scene.positionOf(id);
    if (!at) {
      this.pendingFocus = id;
      return;
    }
    this.pendingFocus = null;
    const direction = this.orbit.position.clone().sub(this.controls.target);
    const distance = Math.min(direction.length(), HOLO.FOCUS);
    this.fly({ target: at.clone(), position: at.clone().add(direction.normalize().multiplyScalar(distance)) });
  }

  private fly(to: Pose) {
    this.flight = { from: { target: this.controls.target.clone(), position: this.orbit.position.clone() }, to, start: this.clock };
  }

  /**
   * One frame: the controls, the view's own motion and intro, and where the
   * hologram stands. `on` is how far it has risen (0 hidden … 1 up), `rush`
   * the dive's growth, `active` whether it takes the pointer. Returns the
   * zoom: the orbit's distance as a share of the view's framing one.
   */
  update(dt: number, clock: number, { on, rush, active, fov }: { on: number; rush: number; active: boolean; fov: number }): number {
    this.clock = clock;
    const current = this.current;
    this.controls.enabled = active && current !== null;
    this.controls.autoRotate = active && this.autoRotate && !this.state.selectedId && !this.state.hoverId;
    if (!current) {
      this.stand.visible = false;
      return 1;
    }
    const definition = viewDefinition(current.view);
    if (current.compiled && current.shown === Infinity && on > 0.01) current.shown = current.introAt = clock;
    // Scene time (orbits) runs while "Putar otomatis" is on, as in full screen.
    const animate = active && this.autoRotate && Boolean(definition.moving);
    if (animate) this.time += dt;
    current.scene.tick(this.time, animate ? dt : 0);
    if (clock >= current.introAt && current.introAt !== Infinity) {
      const t = clamp01((clock - current.introAt) / (INTRO_MS.short / 1000));
      current.scene.intro?.(t, "short");
      if (t >= 1) current.introAt = Infinity;
    }

    if (this.flight) {
      const f = this.flight;
      const p = easeInOut(clamp01((clock - f.start) / HOLO.FOCUS_TIME));
      this.controls.target.lerpVectors(f.from.target, f.to.target, p);
      this.orbit.position.lerpVectors(f.from.position, f.to.position, p);
      if (p >= 1) this.flight = null;
    } else if (definition.moving && this.state.selectedId) {
      // A selected body that orbits: keep it in the middle of the view.
      const at = current.scene.positionOf(this.state.selectedId);
      if (at) {
        const shift = at.clone().sub(this.controls.target);
        if (shift.lengthSq() > 1e-10) {
          this.controls.target.add(shift);
          this.orbit.position.add(shift);
        }
      }
    }
    this.controls.update(dt);

    const shown = easeOut(clamp01((clock - current.shown) / HOLO.APPEAR));
    const rise = on * shown;
    this.stand.visible = rise > 0.001;
    // Grows out of the tablet's screen and up onto its stand.
    const fit = HOLO.FIT_BY_VIEW[current.view] ?? HOLO.FIT;
    const scale = (fit / current.distance) * (0.02 + 0.98 * easeOut(rise) + rush * 0.4);
    this.stand.position.set(this.centre.x, this.centre.y - (1 - rise) * 1.6, this.centre.z);
    this.stand.scale.setScalar(scale);
    this.pivot.quaternion.copy(this.look).multiply(this.orbit.quaternion.clone().invert());
    this.offset.position.copy(this.controls.target).negate();
    this.sizePoints(scale * (Math.tan(THREE.MathUtils.degToRad(HOLO.FULL_FOV / 2)) / Math.tan(THREE.MathUtils.degToRad(fov / 2))));
    return this.orbit.position.distanceTo(this.controls.target) / current.distance;
  }

  /**
   * Points keep the size they have against the picture in full screen: the
   * hologram is scaled into the room and seen through a narrower lens, so
   * every point material is scaled by `k` (again whenever a view sets its own size).
   */
  private sizePoints(k: number) {
    this.offset.traverse((child) => {
      if (!(child instanceof THREE.Points)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (!(material instanceof THREE.PointsMaterial) || !material.sizeAttenuation) continue;
        const known = this.sizes.get(material);
        const base = known && material.size === known.set ? known.base : material.size;
        material.size = base * k;
        this.sizes.set(material, { base, set: material.size });
      }
    });
  }

  /** The second pass: drawn the way the full screen draws it (sRGB output), faded by `fade`. */
  render(renderer: THREE.WebGLRenderer, camera: THREE.Camera, fade: number) {
    if (!this.current || !this.stand.visible || fade <= 0.001) return;
    if (fade < 0.999) {
      this.stand.traverseVisible((child) => {
        const material = (child as THREE.Mesh).material;
        for (const m of Array.isArray(material) ? material : material ? [material] : []) {
          if (!m.transparent || this.faded.has(m)) continue;
          this.faded.set(m, m.opacity);
          m.opacity *= fade;
        }
      });
    }
    const autoClear = renderer.autoClear;
    const space = renderer.outputColorSpace;
    renderer.autoClear = false;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.render(this.scene, camera);
    renderer.outputColorSpace = space;
    renderer.autoClear = autoClear;
    for (const [material, opacity] of this.faded) material.opacity = opacity;
    this.faded.clear();
  }

  /** Where a key (a term, a group) is in the room, or null. */
  worldOf(key: string): THREE.Vector3 | null {
    const at = this.current?.scene.positionOf(key);
    return at ? at.clone().applyMatrix4(this.offset.matrixWorld) : null;
  }

  /** The term under (x, y) in canvas pixels, as the full screen picks: the nearest on screen within reach. */
  pick(x: number, y: number, touch: boolean, camera: THREE.Camera, width: number, height: number): string | null {
    const current = this.current;
    if (!current || !this.stand.visible) return null;
    this.scene.updateMatrixWorld();
    const out: Projected[] = [];
    for (const id of current.scene.pickable()) {
      const at = this.worldOf(id);
      if (!at) continue;
      const v = at.project(camera);
      out.push({ id, x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height, depth: v.z });
    }
    return pickNearest(out, x, y, touch ? HOLO.HIT_TOUCH : HOLO.HIT)?.id ?? null;
  }

  /** Group names (regions, galaxies, suns, lobes) plus the selected, hovered and newest terms, as in full screen. */
  private refreshLabels() {
    const current = this.current;
    const input = this.input;
    const specs: LabelSpec[] = (current?.scene.groupLabels() ?? []).map((l) => ({ ...l, group: true }));
    if (current && input) {
      const wanted = new Map<string, number>();
      [...input.visible]
        .sort((a, b) => b.learned_on.localeCompare(a.learned_on))
        .slice(0, NEWEST)
        .forEach((p, i) => wanted.set(p.id, (NEWEST - i) / (NEWEST + 1)));
      if (this.state.hoverId) wanted.set(this.state.hoverId, 900);
      if (this.state.selectedId) wanted.set(this.state.selectedId, 1000);
      const byId = new Map(input.points.map((p) => [p.id, p]));
      for (const [id, priority] of wanted) {
        const point = byId.get(id);
        if (point && current.scene.positionOf(id)) specs.push({ key: id, text: point.term, priority, group: false });
      }
    }
    this.specs = specs;
    const keep = new Set(specs.map((s) => s.key));
    for (const [key, label] of this.labels) {
      if (keep.has(key)) continue;
      label.el.remove();
      this.labels.delete(key);
    }
    for (const spec of specs) {
      let label = this.labels.get(spec.key);
      if (!label) {
        const el = document.createElement("span");
        el.className = "tablet-label";
        el.textContent = spec.text;
        this.layer.appendChild(el);
        label = { el, width: 0, height: 0 };
        this.labels.set(spec.key, label);
      }
      const { el } = label;
      const selected = spec.key === this.state.selectedId;
      // Group names are set in capitals and a selected term in bold: measured once they look like that.
      if (el.hasAttribute("data-group") !== spec.group || el.hasAttribute("data-selected") !== selected || label.width === 0) {
        el.toggleAttribute("data-group", spec.group);
        el.toggleAttribute("data-selected", selected);
        label.width = el.offsetWidth;
        label.height = el.offsetHeight;
      }
      el.style.opacity = spec.opacity !== undefined && spec.opacity < 1 ? String(spec.opacity) : "";
    }
  }

  /** Places the labels over the canvas: project, keep clear of each other and the edges, hide the rest. */
  placeLabels(camera: THREE.Camera, width: number, height: number, opacity: number) {
    const visible = opacity > 0.01 && this.stand.visible;
    this.layer.style.opacity = visible ? String(opacity) : "0";
    if (!visible) return;
    const boxes: { id: string; x: number; y: number; width: number; height: number; priority: number }[] = [];
    for (const spec of this.specs) {
      const label = this.labels.get(spec.key);
      const at = label ? this.worldOf(spec.key) : null;
      if (!label || !at) continue;
      const v = at.project(camera);
      if (v.z < -1 || v.z > 1) continue;
      const sx = ((v.x + 1) / 2) * width;
      const sy = ((1 - v.y) / 2) * height;
      const { width: w, height: h } = label;
      let x = spec.group ? sx - w / 2 : sx + 9;
      if (!spec.group && x + w > width - 4) x = sx - 9 - w;
      if (spec.group) x = Math.min(Math.max(x, 4), width - 4 - w);
      const y = sy - h / 2;
      if (x < 4 || y < 4 || y + h > height - 4) continue;
      boxes.push({ id: spec.key, x, y, width: w, height: h, priority: spec.priority });
    }
    const shown = new Set(placeLabels(boxes, HOLO.LABELS));
    const at = new Map(boxes.map((b) => [b.id, b]));
    for (const [id, { el }] of this.labels) {
      const box = at.get(id);
      if (box && shown.has(id)) {
        el.style.transform = `translate(${Math.round(box.x)}px, ${Math.round(box.y)}px)`;
        el.style.visibility = "visible";
      } else el.style.visibility = "hidden";
    }
  }

  dispose() {
    this.controls.dispose();
    if (this.current) {
      this.offset.remove(this.current.scene.root);
      this.current.scene.dispose();
      this.current = null;
    }
    this.layer.remove();
    this.probe.remove();
  }
}
