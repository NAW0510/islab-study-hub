import {
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  Vector3,
} from "three";
import { BRAIN_REGIONS, brainNormal, scaffoldOpacity } from "@/lib/vocab/brain-model";
import type { BrainMesh, BrainMeshMessage, BrainMeshRequest } from "@/lib/vocab/layout/brain-mesh.worker";
import type { Point3 } from "@/lib/vocab/layout/run-layout-3d";
import { termGroups } from "@/lib/vocab/map3d-model";
import { colorVar, discTexture, disposeTree, HighlightLayer, setPoints, type GroupLabel, type Highlight, type SceneInput, type ViewScene } from "./common";

const SIZE = { scaffold: 0.026, lit: 0.075, mark: 0.15 } as const;
/** Grid resolution of the cortex surface: one cell ≈ 0.023, about a tenth of a fold's wavelength. */
const MESH_RESOLUTION = 96;
/** How much of its field's colour a lobe (and its sleeping neurons) takes; more on legend hover. */
const LOBE_TINT = 0.4;
const LOBE_TINT_STRONG = 0.8;
/**
 * The colour of brain tissue, a soft pinkish beige. Part of the picture,
 * not of the interface, so it is not a design token.
 */
const TISSUE = new Color("#ecc8bf");

// The cortex surface does not depend on the terms: build it once per page visit, off the main thread.
let meshPromise: Promise<BrainMesh> | null = null;
function loadBrainMesh(): Promise<BrainMesh> {
  meshPromise ??= new Promise<BrainMesh>((resolve, reject) => {
    const worker = new Worker(new URL("../../../../lib/vocab/layout/brain-mesh.worker.ts", import.meta.url));
    worker.onmessage = (event: MessageEvent<BrainMeshMessage>) => {
      worker.terminate();
      if (event.data.type === "done") resolve(event.data.mesh);
      else reject(new Error(event.data.message));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "Worker gagal dimuat."));
    };
    worker.postMessage({ resolution: MESH_RESOLUTION } satisfies BrainMeshRequest);
  }).catch((error) => {
    meshPromise = null; // try again next time
    throw error;
  });
  return meshPromise;
}

/**
 * "Otak": a brain with real proportions and a folded cortex. Sleeping neurons
 * sit on the crests of the folds, tinted by the field that owns their lobe;
 * every term lights one neuron in its field's lobe, and arcs (synapses) join
 * each term to the two terms most like it. Always on the light canvas.
 */
export class BrainScene implements ViewScene {
  readonly root = new Group();
  private readonly texture = discTexture();
  private readonly cortex = new Group();
  private readonly scaffold = new Points(new BufferGeometry(), new PointsMaterial({ vertexColors: true, transparent: true, depthWrite: false, size: SIZE.scaffold }));
  private readonly lit = new Points(new BufferGeometry(), new PointsMaterial({ vertexColors: true, transparent: true, depthWrite: false, size: SIZE.lit }));
  private readonly synapses = new Group();
  private readonly marks: HighlightLayer;
  private positions = new Map<string, Vector3>();
  private ids: string[] = [];
  private labels: GroupLabel[] = [];
  private scaffoldField: (string | null)[] = [];
  private fieldColour = new Map<string, Color>();
  /** Field owning each lobe (by majority of its slots); null when no field uses it. */
  private lobeOwner: (string | null)[] = [];
  private mesh: BrainMesh | null = null;
  private cortexMesh: Mesh | null = null;
  private emphasized: string | null = null;
  private arrived = false;
  private disposed = false;

  constructor() {
    for (const p of [this.scaffold, this.lit]) (p.material as PointsMaterial).map = this.texture;
    this.scaffold.renderOrder = 3;
    this.lit.renderOrder = 4;
    this.marks = new HighlightLayer(this.texture, SIZE.mark);

    // Soft light from above and the front, a warm bounce from below, and a rim from behind.
    const sky = new HemisphereLight(0xffffff, 0x8f7a74, 1.15);
    const key = new DirectionalLight(0xffffff, 1.25);
    key.position.set(2, 3, -2.5);
    const rim = new DirectionalLight(0xffffff, 0.45);
    rim.position.set(-2.5, 1, 2);
    this.root.add(sky, key, rim, this.cortex, this.synapses, this.scaffold, this.lit, this.marks.root);

    loadBrainMesh()
      .then((mesh) => {
        if (this.disposed) return;
        this.mesh = mesh;
        this.makeCortex();
        this.arrived = true;
      })
      .catch(() => {
        // Without the surface the neurons alone still draw the brain.
      });
  }

  private makeCortex() {
    if (!this.mesh) return;
    disposeTree(this.cortex);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(this.mesh.positions, 3));
    geometry.setAttribute("normal", new Float32BufferAttribute(this.mesh.normals, 3));
    geometry.setAttribute("color", new Float32BufferAttribute(new Float32Array(this.mesh.positions.length), 3));
    this.cortexMesh = new Mesh(geometry, new MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 }));
    this.cortex.add(this.cortexMesh);
    this.paintCortex();
  }

  /** Tissue colour, tinted per lobe by its field, darker in the sulci. */
  private paintCortex() {
    if (!this.mesh || !this.cortexMesh) return;
    const { regions, folds } = this.mesh;
    const colours = this.cortexMesh.geometry.getAttribute("color");
    const perLobe = BRAIN_REGIONS.map((_, r) => {
      const owner = this.lobeOwner[r];
      const tint = owner ? this.fieldColour.get(owner) : undefined;
      return tint ? TISSUE.clone().lerp(tint, owner === this.emphasized ? LOBE_TINT_STRONG : LOBE_TINT) : TISSUE;
    });
    for (let i = 0; i < regions.length; i++) {
      const base = perLobe[regions[i]];
      // Ambient occlusion, roughly: grooves get less light than ridges.
      const t = Math.min(1, Math.max(0, (folds[i] + 1.1) / 2.2));
      const shade = 0.62 + 0.38 * t * t * (3 - 2 * t);
      colours.setXYZ(i, base.r * shade, base.g * shade, base.b * shade);
    }
    colours.needsUpdate = true;
  }

  build(input: SceneInput) {
    const { data, visible, domains, color } = input;
    const brain = data.brain;
    this.fieldColour = new Map();
    const colourOf = (fieldId: string | null) => {
      const key = fieldId ?? "none";
      if (!this.fieldColour.has(key)) this.fieldColour.set(key, color(colorVar(fieldId ? (domains.get(fieldId) ?? null) : null)));
      return this.fieldColour.get(key) as Color;
    };
    for (const field of new Set(brain.slotField)) if (field) colourOf(field);

    // Which field owns each lobe: the one most of its slots belong to.
    this.lobeOwner = BRAIN_REGIONS.map((_, r) => {
      const votes = new Map<string, number>();
      brain.slotRegion.forEach((region, i) => {
        const field = brain.slotField[i];
        if (region === r && field) votes.set(field, (votes.get(field) ?? 0) + 1);
      });
      return [...votes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    });
    this.paintCortex();

    // Lit neurons: the visible terms on their slots.
    this.positions = new Map();
    const litSlots = new Set<number>();
    const litColours: Color[] = [];
    const litAt: Vector3[] = [];
    for (const p of visible) {
      const slot = brain.termSlot.get(p.id);
      if (slot === undefined) continue;
      litSlots.add(slot);
      const at = new Vector3(...brain.slots[slot]);
      this.positions.set(p.id, at);
      litAt.push(at);
      litColours.push(colourOf(termGroups(p.domain_id, domains).fieldId));
    }
    this.ids = [...this.positions.keys()];
    setPoints(this.lit, litAt, litColours);

    // Sleeping neurons: every other slot, fainter once the terms alone start to draw the brain.
    const sleeping: Vector3[] = [];
    this.scaffoldField = [];
    brain.slots.forEach((slot, i) => {
      if (litSlots.has(i)) return;
      sleeping.push(new Vector3(...slot));
      this.scaffoldField.push(brain.slotField[i]);
    });
    setPoints(this.scaffold, sleeping, this.scaffoldColours());
    (this.scaffold.material as PointsMaterial).opacity = scaffoldOpacity(this.ids.length);

    // Synapses: an arc above the cortex from each visible term to its two most similar visible terms.
    disposeTree(this.synapses);
    const ends: number[] = [];
    const colours: number[] = [];
    const seen = new Set<string>();
    for (const p of visible) {
      const from = this.positions.get(p.id);
      if (!from) continue;
      const c = colourOf(termGroups(p.domain_id, domains).fieldId);
      for (const other of data.neighbours.get(p.id) ?? []) {
        const to = this.positions.get(other);
        const pair = p.id < other ? `${p.id}|${other}` : `${other}|${p.id}`;
        if (!to || seen.has(pair)) continue;
        seen.add(pair);
        const arc = synapseArc(from, to);
        for (let k = 0; k < arc.length - 1; k++) {
          ends.push(arc[k].x, arc[k].y, arc[k].z, arc[k + 1].x, arc[k + 1].y, arc[k + 1].z);
          colours.push(c.r, c.g, c.b, c.r, c.g, c.b);
        }
      }
    }
    if (ends.length) {
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new Float32BufferAttribute(ends, 3));
      geometry.setAttribute("color", new Float32BufferAttribute(colours, 3));
      const lines = new LineSegments(geometry, new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false }));
      lines.renderOrder = 2;
      this.synapses.add(lines);
    }

    // Labels: each field's name over the middle of its lobes, lifted off the surface.
    this.labels = [];
    const sums = new Map<string, { at: Vector3; n: number }>();
    brain.slots.forEach((slot, i) => {
      const field = brain.slotField[i];
      if (!field) return;
      const entry = sums.get(field) ?? { at: new Vector3(), n: 0 };
      entry.at.add(new Vector3(...slot));
      entry.n++;
      sums.set(field, entry);
    });
    const counts = new Map<string, number>();
    for (const p of visible) {
      const field = termGroups(p.domain_id, domains).fieldId;
      if (field) counts.set(field, (counts.get(field) ?? 0) + 1);
    }
    for (const [field, { at, n }] of sums) {
      const key = `lobe:${field}`;
      const middle = at.divideScalar(n);
      const out = middle.clone().sub(new Vector3(0, -0.15, 0)).normalize().multiplyScalar(0.25);
      this.positions.set(key, middle.add(out));
      this.labels.push({ key, text: `${domains.get(field)?.name ?? "Bidang"} ${counts.get(field) ?? 0}`, priority: 950 });
    }
  }

  private scaffoldColours(): Color[] {
    // Sleeping neurons: a lighter dot of tissue, tinted like their lobe.
    const light = TISSUE.clone().lerp(new Color(0xffffff), 0.55);
    return this.scaffoldField.map((field) => {
      const tint = field ? this.fieldColour.get(field) : undefined;
      if (!tint) return light;
      return light.clone().lerp(tint, field === this.emphasized ? LOBE_TINT_STRONG : LOBE_TINT);
    });
  }

  emphasize(fieldId: string | null) {
    this.emphasized = fieldId;
    this.paintCortex();
    const attribute = this.scaffold.geometry.getAttribute("position");
    if (!attribute) return;
    const positions: Vector3[] = [];
    for (let i = 0; i < attribute.count; i++) positions.push(new Vector3(attribute.getX(i), attribute.getY(i), attribute.getZ(i)));
    setPoints(this.scaffold, positions, this.scaffoldColours());
  }

  highlight(h: Highlight, input: SceneInput) {
    const colourOf = (id: string) => {
      const point = input.points.find((p) => p.id === id);
      return this.fieldColour.get(termGroups(point?.domain_id ?? null, input.domains).fieldId ?? "none") ?? TISSUE;
    };
    this.marks.update(h, { ...input, theme: "light" }, colourOf, (key) => this.positionOf(key));
  }

  /** The cortex surface arrives from its worker a moment after the scene is shown: redraw once then. */
  tick() {
    if (!this.arrived) return false;
    this.arrived = false;
    return true;
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
    // Three-quarter view from the front left, slightly above: both hemispheres, the fissure and the cerebellum show.
    return { target: new Vector3(0, -0.15, 0), position: new Vector3(2.0, 1.2, -2.6) };
  }

  dispose() {
    this.disposed = true;
    this.marks.dispose();
    disposeTree(this.root);
    this.texture.dispose();
  }
}

/** A curve from `a` to `b` that rises above the cortex instead of cutting through it. */
function synapseArc(a: Vector3, b: Vector3, segments = 10): Vector3[] {
  const na = new Vector3(...brainNormal([a.x, a.y, a.z] as Point3));
  const nb = new Vector3(...brainNormal([b.x, b.y, b.z] as Point3));
  const lift = a.distanceTo(b) * 0.35 + 0.02;
  const control = a.clone().add(b).multiplyScalar(0.5).add(na.add(nb).normalize().multiplyScalar(lift));
  return Array.from({ length: segments + 1 }, (_, i) => {
    const t = i / segments;
    const u = 1 - t;
    return new Vector3(
      u * u * a.x + 2 * u * t * control.x + t * t * b.x,
      u * u * a.y + 2 * u * t * control.y + t * t * b.y,
      u * u * a.z + 2 * u * t * control.z + t * t * b.z,
    );
  });
}
