import { BufferGeometry, Color, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments, Points, PointsMaterial, Vector3 } from "three";
import { scaffoldOpacity } from "@/lib/vocab/brain-model";
import { termGroups } from "@/lib/vocab/map3d-model";
import { colorVar, discTexture, disposeTree, HighlightLayer, setPoints, type GroupLabel, type Highlight, type SceneInput, type ViewScene } from "./common";

const SIZE = { scaffold: 0.03, lit: 0.085, mark: 0.17 } as const;
/** How much of its field's colour a sleeping neuron in that field's lobe takes; more on legend hover. */
const LOBE_TINT = 0.32;
const LOBE_TINT_STRONG = 0.75;

/**
 * "Otak": a brain made of neurons. Sleeping neurons (grey, tinted by the field
 * that owns their lobe) give the shape and its folds; every term lights one
 * neuron in its field's lobe, and thin synapses join each term to the two
 * terms most like it. Always on the light canvas.
 */
export class BrainScene implements ViewScene {
  readonly root = new Group();
  private readonly texture = discTexture();
  private readonly scaffold = new Points(new BufferGeometry(), new PointsMaterial({ vertexColors: true, transparent: true, depthWrite: false, size: SIZE.scaffold }));
  private readonly lit = new Points(new BufferGeometry(), new PointsMaterial({ vertexColors: true, transparent: true, depthWrite: false, size: SIZE.lit }));
  private readonly synapses = new Group();
  private readonly marks: HighlightLayer;
  private positions = new Map<string, Vector3>();
  private ids: string[] = [];
  private labels: GroupLabel[] = [];
  /** Per scaffold point: the field owning its lobe (for re-tinting on hover). */
  private scaffoldField: (string | null)[] = [];
  private grey = new Color(0x999999);
  private fieldColour = new Map<string, Color>();

  constructor() {
    for (const p of [this.scaffold, this.lit]) (p.material as PointsMaterial).map = this.texture;
    this.scaffold.renderOrder = 1;
    this.lit.renderOrder = 4;
    this.marks = new HighlightLayer(this.texture, SIZE.mark);
    this.root.add(this.scaffold, this.synapses, this.lit, this.marks.root);
  }

  build(input: SceneInput) {
    const { data, visible, domains, color } = input;
    const brain = data.brain;
    this.grey = color("var(--muted)");
    this.fieldColour = new Map();
    const colourOf = (fieldId: string | null) => {
      const key = fieldId ?? "none";
      if (!this.fieldColour.has(key)) this.fieldColour.set(key, color(colorVar(fieldId ? (domains.get(fieldId) ?? null) : null)));
      return this.fieldColour.get(key) as Color;
    };

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

    // Sleeping neurons: every other slot, fainter as the terms alone start to draw the brain.
    const sleeping: Vector3[] = [];
    this.scaffoldField = [];
    brain.slots.forEach((slot, i) => {
      if (litSlots.has(i)) return;
      sleeping.push(new Vector3(...slot));
      this.scaffoldField.push(brain.slotField[i]);
    });
    setPoints(this.scaffold, sleeping, this.scaffoldColours(null));
    (this.scaffold.material as PointsMaterial).opacity = scaffoldOpacity(this.ids.length);

    // Synapses: each visible term to its two most similar visible terms (each pair once).
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
        ends.push(from.x, from.y, from.z, to.x, to.y, to.z);
        colours.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
    }
    if (ends.length) {
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new Float32BufferAttribute(ends, 3));
      geometry.setAttribute("color", new Float32BufferAttribute(colours, 3));
      const lines = new LineSegments(geometry, new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.45, depthWrite: false }));
      lines.renderOrder = 2;
      this.synapses.add(lines);
    }

    // Labels: each field's name over the middle of its lobes.
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
      this.positions.set(key, at.divideScalar(n));
      this.labels.push({ key, text: `${domains.get(field)?.name ?? "Bidang"} ${counts.get(field) ?? 0}`, priority: 950 });
    }
  }

  private scaffoldColours(strong: string | null): Color[] {
    return this.scaffoldField.map((field) => {
      if (!field) return this.grey;
      const tint = this.fieldColour.get(field) ?? this.grey;
      return this.grey.clone().lerp(tint, field === strong ? LOBE_TINT_STRONG : LOBE_TINT);
    });
  }

  emphasize(fieldId: string | null) {
    const attribute = this.scaffold.geometry.getAttribute("position");
    if (!attribute) return;
    const positions: Vector3[] = [];
    for (let i = 0; i < attribute.count; i++) positions.push(new Vector3(attribute.getX(i), attribute.getY(i), attribute.getZ(i)));
    setPoints(this.scaffold, positions, this.scaffoldColours(fieldId));
  }

  highlight(h: Highlight, input: SceneInput) {
    const colourOf = (id: string) => {
      const point = input.points.find((p) => p.id === id);
      return this.fieldColour.get(termGroups(point?.domain_id ?? null, input.domains).fieldId ?? "none") ?? this.grey;
    };
    this.marks.update(h, { ...input, theme: "light" }, colourOf, (key) => this.positionOf(key));
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
    // Three-quarter view from the front left, slightly above: both hemispheres, the fissure and the cerebellum show.
    return { target: new Vector3(0, -0.12, 0), position: new Vector3(1.9, 1.1, -2.5) };
  }

  dispose() {
    this.marks.dispose();
    disposeTree(this.root);
    this.texture.dispose();
  }
}
