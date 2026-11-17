"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Texture,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import { Info, Loader2, Maximize, Moon, Pause, Play, Plus, Rotate3d, Search, Sun } from "lucide-react";
import type { NearestTerm } from "@/lib/actions/vocab";
import { currentWeekInfo, weekMarker, weekNumberFor } from "@/lib/report-template";
import type { VocabDomain } from "@/lib/types";
import { cn, formatDate, normalizeSearch, todayISO } from "@/lib/utils";
import { domainIndex, domainPath } from "@/lib/vocab/format";
import { placeLabels } from "@/lib/vocab/labels";
import type { Point3 } from "@/lib/vocab/layout/run-layout-3d";
import { groups3d, paddedCloud3d, pickNearest, visible3d, withoutOutliers3d, type Projected } from "@/lib/vocab/map3d-model";
import { fieldOf, firstSentence, mapStats, MIN_TERMS_FOR_MAP, type BoundaryLevel, type MapPoint } from "@/lib/vocab/map-model";
import { asDomainColor } from "@/lib/vocab/seed-domains";
import { EmptyState } from "../../ui";
import { useToast } from "../../toast";
import { MapDetailPanel } from "./map-detail-panel";
import { useLayout3d } from "./use-layout-3d";

type Props = { points: MapPoint[]; domains: VocabDomain[]; programStart: string };
type Theme = "dark" | "light";
type LabelSpec = { id: string; text: string; at: Point3; priority: number; field: boolean };

const THEME_KEY = "peta-otak-3d:tema";
const HIT_RADIUS = 14;
const TOUCH_HIT_RADIUS = 24;
/** Width of the detail panel on wide screens (`md:w-80`) and the share of the canvas its bottom sheet covers on phones. */
const PANEL_WIDTH = 320;
const SHEET_SHARE = 0.62;
const DOT_SIZE = 0.11;
const MARK_SIZE = 0.21;
/** Region fill opacity per canvas theme, and when its field is highlighted from the legend. */
const REGION_OPACITY: Record<Theme, number> = { dark: 0.16, light: 0.17 };
const REGION_HIGHLIGHT = 0.34;
const FLY_MS = 450;
const START_POSITION = new Vector3(2.3, 1.5, 2.7);
const NO_COORDS: ReadonlyMap<string, Point3> = new Map();

const colorVar = (domain: VocabDomain | null) => `var(--${asDomainColor(domain?.color)})`;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function initialTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    // no storage: fall back to the system setting
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function hasWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Round sprite for the points: a soft glow for the dark canvas, a crisp disc with a soft rim for the light one. */
function dotTexture(kind: Theme): Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d") as CanvasRenderingContext2D;
  const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  if (kind === "dark") {
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.22, "rgba(255,255,255,0.95)");
    gradient.addColorStop(0.45, "rgba(255,255,255,0.35)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
  } else {
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.62, "rgba(255,255,255,1)");
    gradient.addColorStop(0.8, "rgba(255,255,255,0.35)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
  }
  g.fillStyle = gradient;
  g.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

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

type Stage = {
  renderer: WebGLRenderer;
  camera: PerspectiveCamera;
  controls: OrbitControls;
  frame: LineSegments;
  grid: Points;
  dots: Points;
  marks: Points;
  links: Group;
  regions: Group;
  textures: Record<Theme, Texture>;
  dirty: boolean;
  width: number;
  height: number;
  flight: { fromTarget: Vector3; toTarget: Vector3; fromPos: Vector3; toPos: Vector3; start: number } | null;
};

export default function BrainMap3D({ points, domains, programStart }: Props) {
  const toast = useToast();
  const hostRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const labelEls = useRef(new Map<string, HTMLSpanElement>());
  const labelsRef = useRef<LabelSpec[]>([]);
  const visibleRef = useRef<{ id: string; at: Point3 }[]>([]);
  const panelOpenRef = useRef(false);
  const downRef = useRef<{ x: number; y: number } | null>(null);

  const [webgl] = useState(hasWebGL);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [autoRotate, setAutoRotate] = useState(() => !reducedMotion());
  const [hiddenFields, setHiddenFields] = useState<Set<string>>(() => new Set());
  const [hover, setHover] = useState<{ id: string; px: number; py: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [neighbours, setNeighbours] = useState<{ id: string; list: NearestTerm[] } | null>(null);
  const [query, setQuery] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const [level, setLevel] = useState<BoundaryLevel>("bidang");
  const [hoverField, setHoverField] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [hostSize, setHostSize] = useState({ w: 0, h: 0 });

  const domainIdx = useMemo(() => domainIndex(domains), [domains]);
  const { week: currentWeek } = currentWeekInfo(programStart, todayISO());
  const [week, setWeek] = useState(currentWeek);

  const { state: layout, retry } = useLayout3d(points);
  const coords = layout.phase === "ready" ? layout.coords : NO_COORDS;
  const visible = useMemo(
    () => visible3d(points, coords, { programStart, week, hiddenFields, domains: domainIdx }),
    [points, coords, programStart, week, hiddenFields, domainIdx],
  );
  const pointById = useMemo(() => new Map(points.map((p) => [p.id, p])), [points]);
  const groups = useMemo(() => groups3d(visible, coords, level, domainIdx), [visible, coords, level, domainIdx]);
  const stats = useMemo(() => mapStats(visible, { programStart, currentWeek, domains: domainIdx }), [visible, programStart, currentWeek, domainIdx]);
  const searchHit = normalizeSearch(query.trim());

  // ── The three.js stage (created once) ───────────────────────────────────
  useEffect(() => {
    const host = hostRef.current;
    if (!webgl || !host) return;

    const renderer = new WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.className = "absolute inset-0 size-full";
    host.prepend(renderer.domElement);

    const scene = new Scene();
    const camera = new PerspectiveCamera(45, 1, 0.01, 50);
    camera.position.copy(START_POSITION);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.5;
    controls.maxDistance = 9;
    controls.autoRotateSpeed = 0.7;
    controls.saveState();

    const frame = new LineSegments(new EdgesGeometry(new BoxGeometry(2, 2, 2)), new LineBasicMaterial({ transparent: true, opacity: 0.4 }));
    const grid = new Points(wallGrid(), new PointsMaterial({ size: 0.014, transparent: true, opacity: 0.45, depthWrite: false }));
    const textures = { dark: dotTexture("dark"), light: dotTexture("light") };
    const material = () => new PointsMaterial({ vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true });
    const dots = new Points(new BufferGeometry(), material());
    const marks = new Points(new BufferGeometry(), material());
    (dots.material as PointsMaterial).size = DOT_SIZE;
    (marks.material as PointsMaterial).size = MARK_SIZE;
    const links = new Group();
    const regions = new Group();
    // Transparent objects are drawn in this order (not by creation order): regions (1) under lines (2)
    // under points (3, 4). Set on the objects themselves: a Group's renderOrder would outrank its children's.
    dots.renderOrder = 3;
    marks.renderOrder = 4;
    scene.add(frame, grid, regions, links, dots, marks);

    const stage: Stage = { renderer, camera, controls, frame, grid, dots, marks, links, regions, textures, dirty: true, width: 0, height: 0, flight: null };
    stageRef.current = stage;

    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      stage.width = width;
      stage.height = height;
      renderer.setSize(width, height, false);
      applyViewOffset(stage, panelOpenRef.current);
      setHostSize((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
    };
    // Fires once right after observe(), then on every size change.
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    controls.addEventListener("change", () => {
      stage.dirty = true;
    });

    let frameId = 0;
    let last = performance.now();
    const tick = (now: number) => {
      frameId = requestAnimationFrame(tick);
      if (stage.flight) {
        const t = Math.min(1, (now - stage.flight.start) / FLY_MS);
        const e = 1 - (1 - t) ** 3;
        controls.target.lerpVectors(stage.flight.fromTarget, stage.flight.toTarget, e);
        camera.position.lerpVectors(stage.flight.fromPos, stage.flight.toPos, e);
        if (t >= 1) stage.flight = null;
        stage.dirty = true;
      }
      const moved = controls.update(Math.min(0.1, (now - last) / 1000));
      last = now;
      if (moved || stage.dirty) {
        renderer.render(scene, camera);
        stage.dirty = false;
        positionLabels(stage, labelsRef.current, labelEls.current);
      }
    };
    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      controls.dispose();
      for (const object of [frame, grid, dots, marks]) {
        object.geometry.dispose();
        (object.material as PointsMaterial).dispose();
      }
      disposeGroup(links);
      disposeGroup(regions);
      textures.dark.dispose();
      textures.light.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      stageRef.current = null;
    };
  }, [webgl]);

  // ── Colours: read the design tokens as the chosen canvas theme resolves them ──
  const resolve = useCallback((css: string) => {
    const probe = probeRef.current;
    if (!probe) return new Color(0x888888);
    probe.style.color = css;
    const color = new Color();
    try {
      color.setStyle(getComputedStyle(probe).color);
    } catch {
      color.set(0x888888);
    }
    return color;
  }, []);

  // Theme: blending, sprite and frame colours.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    for (const layer of [stage.dots, stage.marks]) {
      const material = layer.material as PointsMaterial;
      material.map = stage.textures[theme];
      material.blending = theme === "dark" ? AdditiveBlending : NormalBlending;
      material.needsUpdate = true;
    }
    (stage.frame.material as LineBasicMaterial).color = resolve("var(--border-strong)");
    (stage.grid.material as PointsMaterial).color = resolve("var(--muted)");
    stage.dirty = true;
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // remembering the choice is a convenience only
    }
  }, [theme, resolve]);

  // Points: positions and colours of everything visible.
  useEffect(() => {
    const stage = stageRef.current;
    visibleRef.current = visible.map((p) => ({ id: p.id, at: coords.get(p.id) as Point3 }));
    if (!stage) return;
    const background = resolve("var(--surface)");
    const byField = new Map<string, Color>();
    const positions = new Float32Array(visible.length * 3);
    const colors = new Float32Array(visible.length * 3);
    visible.forEach((p, i) => {
      positions.set(coords.get(p.id) as Point3, i * 3);
      const field = fieldOf(p.domain_id, domainIdx);
      const key = field?.id ?? "none";
      if (!byField.has(key)) byField.set(key, resolve(field ? colorVar(field) : "var(--domain-none)"));
      const color = (byField.get(key) as Color).clone();
      if (p.domain_source === "pending") color.lerp(background, 0.5);
      colors.set([color.r, color.g, color.b], i * 3);
    });
    const geometry = stage.dots.geometry;
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();
    stage.dirty = true;
  }, [visible, coords, domainIdx, theme, resolve]);

  // Highlights: the selected and hovered terms, drawn larger on top.
  const effectiveAutoRotate = autoRotate && !selectedId && !hover;
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.controls.autoRotate = effectiveAutoRotate;
    const ids = [selectedId, hover?.id].filter((id, i, all): id is string => Boolean(id) && all.indexOf(id) === i && coords.has(id as string));
    const white = new Color(theme === "dark" ? 0xffffff : 0x000000);
    const positions = new Float32Array(ids.length * 3);
    const colors = new Float32Array(ids.length * 3);
    ids.forEach((id, i) => {
      positions.set(coords.get(id) as Point3, i * 3);
      const color = resolve(colorVar(fieldOf(pointById.get(id)?.domain_id ?? null, domainIdx))).lerp(white, 0.3);
      colors.set([color.r, color.g, color.b], i * 3);
    });
    const geometry = stage.marks.geometry;
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();
    stage.dirty = true;
  }, [selectedId, hover?.id, coords, pointById, domainIdx, theme, resolve, effectiveAutoRotate]);

  // Regions: a translucent hull around each field's (or branch's) terms, like the 2D map.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    disposeGroup(stage.regions);
    for (const g of groups) {
      const cloud = paddedCloud3d(withoutOutliers3d(g.members)).map((p) => new Vector3(p[0], p[1], p[2]));
      let geometry: ConvexGeometry;
      try {
        geometry = new ConvexGeometry(cloud);
      } catch {
        continue; // a degenerate cloud cannot be wrapped; its points are still drawn
      }
      const material = new MeshBasicMaterial({
        color: resolve(colorVar(g.field)),
        transparent: true,
        opacity: hoverField === g.field.id ? REGION_HIGHLIGHT : REGION_OPACITY[theme],
        depthWrite: false,
        side: DoubleSide,
      });
      const mesh = new Mesh(geometry, material);
      mesh.renderOrder = 1;
      stage.regions.add(mesh);
    }
    stage.dirty = true;
  }, [groups, hoverField, theme, resolve]);

  // Lines from the selected term to its nearest neighbours (scores from the real embeddings).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    disposeGroup(stage.links);
    const from = selectedId ? coords.get(selectedId) : undefined;
    if (from && neighbours?.id === selectedId) {
      const ink = resolve("var(--text)");
      const shown = new Set(visible.map((p) => p.id));
      for (const n of neighbours.list) {
        const to = coords.get(n.id);
        if (!to || !shown.has(n.id)) continue;
        const s = Math.max(0, Math.min(1, n.similarity));
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new Float32BufferAttribute([...from, ...to], 3));
        const line = new Line(geometry, new LineBasicMaterial({ color: ink, transparent: true, opacity: 0.15 + 0.6 * s }));
        line.renderOrder = 2;
        stage.links.add(line);
      }
    }
    stage.dirty = true;
  }, [selectedId, neighbours, coords, visible, theme, resolve]);

  // The detail panel covers part of the canvas: shift the view so the middle of what is left is the middle of the picture.
  useEffect(() => {
    panelOpenRef.current = Boolean(selectedId);
    const stage = stageRef.current;
    if (stage) applyViewOffset(stage, panelOpenRef.current);
  }, [selectedId]);

  // Labels: field names at their centres, plus selected, hovered, searched and newest terms.
  useEffect(() => {
    const specs: LabelSpec[] = groups.map(({ group, centre, members }) => ({
      id: `group:${group.id}`,
      text: `${group.name} ${members.length}`,
      at: centre,
      priority: 950,
      field: true,
    }));
    const newest = [...visible].sort((a, b) => b.learned_on.localeCompare(a.learned_on)).slice(0, 12);
    const wanted = new Map<string, number>();
    newest.forEach((p, i) => wanted.set(p.id, (12 - i) / 13));
    if (searchHit) {
      for (const p of visible.filter((v) => normalizeSearch(v.term).includes(searchHit)).slice(0, 10)) wanted.set(p.id, 800);
    }
    if (hover) wanted.set(hover.id, 900);
    if (selectedId) wanted.set(selectedId, 1000);
    for (const [id, priority] of wanted) {
      const at = coords.get(id);
      const point = pointById.get(id);
      if (at && point && visible.some((v) => v.id === id)) specs.push({ id, text: point.term, at, priority, field: false });
    }
    labelsRef.current = specs;
    const stage = stageRef.current;
    if (stage) stage.dirty = true;
  }, [groups, visible, coords, pointById, searchHit, hover, selectedId]);

  // ── Week playback (same as the 2D map) ──────────────────────────────────
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setWeek((w) => {
        if (w >= currentWeek) {
          setPlaying(false);
          return w;
        }
        return w + 1;
      });
    }, 900);
    return () => window.clearInterval(timer);
  }, [playing, currentWeek]);

  // ── Camera moves ────────────────────────────────────────────────────────
  const flyTo = useCallback((at: Point3) => {
    const stage = stageRef.current;
    if (!stage) return;
    const target = new Vector3(...at);
    const direction = stage.camera.position.clone().sub(stage.controls.target);
    const distance = Math.min(direction.length(), 1.8);
    const toPos = target.clone().add(direction.normalize().multiplyScalar(distance));
    if (reducedMotion()) {
      stage.controls.target.copy(target);
      stage.camera.position.copy(toPos);
      stage.dirty = true;
      return;
    }
    stage.flight = { fromTarget: stage.controls.target.clone(), toTarget: target, fromPos: stage.camera.position.clone(), toPos, start: performance.now() };
  }, []);

  const resetView = () => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.flight = null;
    stage.controls.reset();
    stage.dirty = true;
  };

  const focusPoint = useCallback(
    (id: string) => {
      setSelectedId(id);
      const at = coords.get(id);
      if (at) flyTo(at);
    },
    [coords, flyTo],
  );

  // ── Pointer: hover and pick (dragging belongs to OrbitControls) ─────────
  const project = (): Projected[] => {
    const stage = stageRef.current;
    if (!stage) return [];
    const v = new Vector3();
    return visibleRef.current.map(({ id, at }) => {
      v.set(at[0], at[1], at[2]).project(stage.camera);
      return { id, x: ((v.x + 1) / 2) * stage.width, y: ((1 - v.y) / 2) * stage.height, depth: v.z };
    });
  };
  const locate = (event: React.PointerEvent) => {
    const rect = (hostRef.current as HTMLDivElement).getBoundingClientRect();
    return { px: event.clientX - rect.left, py: event.clientY - rect.top };
  };

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    downRef.current = { x: event.clientX, y: event.clientY };
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") return;
    if (event.buttons !== 0) {
      if (hover) setHover(null);
      return;
    }
    const { px, py } = locate(event);
    const hit = pickNearest(project(), px, py, HIT_RADIUS);
    if (hit) setHover({ id: hit.id, px, py });
    else if (hover) setHover(null);
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const down = downRef.current;
    downRef.current = null;
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return; // that was a rotation
    const { px, py } = locate(event);
    const hit = pickNearest(project(), px, py, event.pointerType === "touch" ? TOUCH_HIT_RADIUS : HIT_RADIUS);
    if (!hit) return;
    setHover(null);
    setSelectedId(hit.id);
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const q = normalizeSearch(query.trim());
    if (!q) return;
    const placed = points.filter((p) => coords.has(p.id));
    const match =
      placed.find((p) => normalizeSearch(p.term) === q) ?? placed.find((p) => normalizeSearch(`${p.term} ${p.aliases.join(" ")}`).includes(q));
    if (!match) {
      toast({ message: `“${query.trim()}” tidak ada di ruang 3D.` });
      return;
    }
    // Make sure the term is not hidden by the week slider or the legend.
    setWeek((w) => Math.max(w, Math.min(currentWeek, weekNumberFor(programStart, match.learned_on))));
    const key = fieldOf(match.domain_id, domainIdx)?.id ?? "none";
    setHiddenFields((hidden) => {
      if (!hidden.has(key)) return hidden;
      const next = new Set(hidden);
      next.delete(key);
      return next;
    });
    focusPoint(match.id);
  }

  const onNeighbours = useCallback((id: string, list: NearestTerm[]) => setNeighbours({ id, list }), []);
  const registerLabel = useCallback((id: string, el: HTMLSpanElement | null) => {
    if (el) labelEls.current.set(id, el);
    else labelEls.current.delete(id);
  }, []);
  const [labelList, setLabelList] = useState<LabelSpec[]>([]);
  useEffect(() => {
    // Mirror the label specs into state on the next frame, so React renders their elements.
    const frame = requestAnimationFrame(() => setLabelList(labelsRef.current));
    return () => cancelAnimationFrame(frame);
  }, [groups, visible, coords, searchHit, hover, selectedId]);

  // ── States without a space ──────────────────────────────────────────────
  if (points.length < MIN_TERMS_FOR_MAP) {
    return (
      <EmptyState
        icon={Plus}
        title="Peta butuh beberapa istilah dulu"
        description={`Peta Otak terbentuk dari kedekatan makna antaristilah, jadi butuh minimal 5 istilah. Sekarang baru ada ${points.length}.`}
        action={
          <Link href="/vocab" className="btn btn-primary">
            <Plus className="size-4" /> Tambah istilah
          </Link>
        }
      />
    );
  }
  if (!webgl) {
    return (
      <EmptyState
        icon={Rotate3d}
        title="Browser ini tidak bisa menampilkan 3D"
        description="Tampilan 3D butuh WebGL, yang tidak tersedia atau dimatikan di browser ini. Tampilan 2D tetap bisa dipakai."
        action={
          <Link href="/vocab/map" className="btn btn-primary">
            Buka tampilan 2D
          </Link>
        }
      />
    );
  }

  const fields = domains.filter((d) => !d.parent_id);
  const everything = visible3d(points, coords, { programStart, week, hiddenFields: new Set(), domains: domainIdx });
  const legend = [
    ...fields.map((f) => ({ id: f.id, name: f.name, color: colorVar(f) })),
    { id: "none", name: "Tanpa domain", color: "var(--domain-none)" },
  ]
    .map((f) => ({ ...f, count: everything.filter((p) => (fieldOf(p.domain_id, domainIdx)?.id ?? "none") === f.id).length }))
    .filter((f) => f.count > 0);
  const toggleField = (id: string) =>
    setHiddenFields((hidden) => {
      const next = new Set(hidden);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const hoverPoint = hover ? pointById.get(hover.id) : undefined;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={submitSearch} className="relative min-w-48 flex-1" role="search">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari istilah di ruang 3D, lalu Enter"
            aria-label="Cari istilah di ruang 3D"
            list="map3d-terms"
            className="input pl-9"
          />
          <datalist id="map3d-terms">
            {points.slice(0, 500).map((p) => (
              <option key={p.id} value={p.term} />
            ))}
          </datalist>
        </form>
        <label className="flex items-center gap-2 text-sm text-muted">
          Batas
          <select value={level} onChange={(e) => setLevel(e.target.value as BoundaryLevel)} className="input w-auto" aria-label="Tingkat batas wilayah">
            <option value="bidang">Bidang</option>
            <option value="cabang">Cabang</option>
            <option value="none">Tanpa batas</option>
          </select>
        </label>
        <div className="inline-flex rounded-btn border border-border-strong bg-surface p-0.5" role="group" aria-label="Tema kanvas 3D">
          {(
            [
              { key: "dark", label: "Gelap", Icon: Moon },
              { key: "light", label: "Terang", Icon: Sun },
            ] as const
          ).map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              aria-pressed={theme === key}
              onClick={() => setTheme(key)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-btn px-3 text-xs font-medium transition-colors",
                theme === key ? "bg-primary text-primary-fg" : "text-muted hover:text-text",
              )}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={cn("btn btn-sm", autoRotate ? "btn-primary" : "btn-secondary")}
          aria-pressed={autoRotate}
          onClick={() => setAutoRotate((v) => !v)}
        >
          <Rotate3d className="size-3.5" /> Putar otomatis
        </button>
        <button type="button" className="icon-btn" aria-label="Cara membaca ruang 3D" aria-expanded={showInfo} onClick={() => setShowInfo((v) => !v)}>
          <Info className="size-4" />
        </button>
      </div>
      {showInfo && (
        <p className="card px-4 py-3 text-sm text-muted">
          Titik yang berdekatan memang mirip maknanya. Jarak antarkelompok yang berjauhan tidak bisa dibaca secara presisi, karena UMAP
          menjaga struktur lokal, bukan jarak global. Seret untuk memutar, gulir atau cubit untuk zoom, klik kanan atau dua jari untuk
          menggeser. Susunan 3D dihitung dan disimpan di browser ini, jadi perangkat lain bisa menunjukkan sudut yang berbeda.
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-[13rem_1fr]">
        <div className="contents lg:flex lg:flex-col lg:gap-3">
          {legend.length > 0 && (
            <ul className="card order-1 flex gap-1 overflow-x-auto p-2 lg:flex-col lg:overflow-visible" aria-label="Legenda bidang">
              {legend.map((f) => {
                const off = hiddenFields.has(f.id);
                return (
                  <li key={f.id} className="shrink-0">
                    <button
                      type="button"
                      aria-pressed={!off}
                      onClick={() => toggleField(f.id)}
                      onPointerEnter={() => setHoverField(f.id)}
                      onPointerLeave={() => setHoverField(null)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-sm whitespace-nowrap hover:bg-surface-2",
                        off && "opacity-40",
                      )}
                    >
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: f.color }} />
                      <span className="flex-1 truncate">{f.name}</span>
                      <span className="text-xs text-muted tabular-nums">{f.count}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <dl className="card order-3 grid grid-cols-2 gap-x-4 gap-y-2 p-3 text-xs lg:grid-cols-1">
            <Stat label="Istilah tampil" value={stats.total} />
            <Stat label="Cabang ilmu aktif" value={stats.activeDomains} />
            <Stat label="Baru minggu ini" value={stats.thisWeek} />
            <Stat label="Bidang terbesar" value={stats.biggestField ? `${stats.biggestField.name} (${stats.biggestField.count})` : "–"} />
          </dl>
        </div>

        {/* Canvas: its own light or dark theme, like the app's two modes */}
        <div
          ref={hostRef}
          className={cn(
            "theme-scope card relative order-2 h-[min(70dvh,44rem)] min-h-96 touch-none overflow-hidden text-text select-none",
            theme === "dark" ? "scheme-dark" : "scheme-light",
            "bg-[radial-gradient(ellipse_at_center,var(--surface-2),var(--bg))]",
          )}
          role="img"
          aria-label={`Peta Otak 3D: ${visible.length} istilah. Daftar lengkapnya ada di tab Daftar.`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => setHover(null)}
        >
          <span ref={probeRef} aria-hidden="true" className="hidden" />

          {/* Labels: positioned every frame from the 3D scene */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            {labelList.map((l) => (
              <span
                key={l.id}
                ref={(el) => registerLabel(l.id, el)}
                data-field={l.field ? "" : undefined}
                className={cn(
                  "invisible absolute top-0 left-0 whitespace-nowrap text-text [text-shadow:0_0_3px_var(--surface),0_0_3px_var(--surface),0_0_6px_var(--surface)]",
                  l.field ? "text-[11px] font-semibold tracking-[0.04em] uppercase" : "text-[11px]",
                  l.id === selectedId && "font-semibold",
                )}
              >
                {l.text}
              </span>
            ))}
          </div>

          <div className="absolute top-2 left-2 z-10 rounded-control border border-border bg-surface">
            <button type="button" className="icon-btn" aria-label="Kembali ke tampilan awal" onClick={resetView}>
              <Maximize className="size-4" />
            </button>
          </div>

          {layout.phase !== "ready" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted" role="status">
              {layout.phase === "error" ? (
                <>
                  <p className="text-danger">Ruang 3D gagal disusun: {layout.message}</p>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={retry}>
                    Coba lagi
                  </button>
                </>
              ) : (
                <p className="inline-flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  {layout.phase === "computing" ? `Menyusun ruang 3D… ${Math.round(layout.progress * 100)}%` : "Mengambil data istilah…"}
                </p>
              )}
            </div>
          )}
          {layout.phase === "ready" && visible.length === 0 && (
            <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted">
              Tidak ada istilah untuk pilihan Week dan bidang ini.
            </p>
          )}

          {hover && hoverPoint && (
            <div
              role="tooltip"
              className="pointer-events-none absolute z-10 w-60 rounded-card border border-border bg-surface p-3 text-xs text-text shadow-lg"
              style={{ left: Math.min(Math.max(hover.px + 14, 8), Math.max(hostSize.w - 248, 8)), top: Math.min(hover.py + 14, Math.max(hostSize.h - 130, 8)) }}
            >
              <p className="font-display text-sm font-semibold tracking-tight">{hoverPoint.term}</p>
              <p className="mt-0.5 text-muted">{domainPath(hoverPoint.domain_id, domainIdx) || "Tanpa domain"}</p>
              <p className="mt-1 text-muted">
                Dipelajari {formatDate(hoverPoint.learned_on)}, {weekMarker(weekNumberFor(programStart, hoverPoint.learned_on))}
              </p>
              {hoverPoint.snippet.trim() && <p className="mt-1.5">{firstSentence(hoverPoint.snippet)}</p>}
              {hoverPoint.domain_source === "auto" && <p className="mt-1.5 text-muted italic">Domain tebakan sistem, belum ditinjau.</p>}
              {hoverPoint.domain_source === "pending" && <p className="mt-1.5 text-muted italic">Masih menunggu domain.</p>}
            </div>
          )}

          {selectedId && (
            <MapDetailPanel
              termId={selectedId}
              fallbackTitle={pointById.get(selectedId)?.term ?? ""}
              domains={domainIdx}
              programStart={programStart}
              onClose={() => setSelectedId(null)}
              onPick={focusPoint}
              onNeighbours={onNeighbours}
            />
          )}
        </div>
      </div>

      {/* Week slider */}
      <div className="card flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => {
            if (!playing && week >= currentWeek) setWeek(0);
            setPlaying((p) => !p);
          }}
        >
          {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          {playing ? "Jeda" : "Putar"}
        </button>
        <label className="flex min-w-56 flex-1 items-center gap-3 text-sm">
          <span className="w-24 shrink-0 font-display font-semibold tracking-tight tabular-nums">{weekMarker(week)}</span>
          <input
            type="range"
            min={0}
            max={currentWeek}
            step={1}
            value={week}
            onChange={(e) => {
              setPlaying(false);
              setWeek(Number(e.target.value));
            }}
            aria-label="Tampilkan istilah sampai Week"
            aria-valuetext={weekMarker(week)}
            className="min-w-0 flex-1 accent-(--accent)"
          />
          <span className="shrink-0 text-xs text-muted tabular-nums">{weekMarker(currentWeek)}</span>
        </label>
        {layout.phase === "ready" && layout.ms !== null && (
          <span className="text-xs text-muted tabular-nums">Disusun dalam {(layout.ms / 1000).toFixed(1)} detik</span>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function disposeGroup(group: Group) {
  for (const child of [...group.children]) {
    const object = child as Line | Mesh;
    object.geometry.dispose();
    (object.material as LineBasicMaterial | MeshBasicMaterial).dispose();
    group.remove(object);
  }
}

/**
 * Shifts the picture so that its middle is the middle of the part the detail
 * panel leaves free: the panel covers the right on wide screens and the bottom
 * (a sheet) on phones. The camera sees a larger virtual canvas of which only
 * the visible part is drawn.
 */
function applyViewOffset(stage: Stage, panelOpen: boolean) {
  const { camera, width: w, height: h } = stage;
  if (w === 0 || h === 0) return;
  if (!panelOpen) {
    camera.aspect = w / h;
    camera.clearViewOffset();
  } else if (window.matchMedia("(min-width: 768px)").matches) {
    const p = Math.min(PANEL_WIDTH, w / 2);
    camera.aspect = (w + p) / h;
    camera.setViewOffset(w + p, h, p, 0, w, h);
  } else {
    const s = Math.round(h * SHEET_SHARE);
    camera.aspect = w / (h + s);
    camera.setViewOffset(w, h + s, 0, s, w, h);
  }
  camera.updateProjectionMatrix();
  stage.dirty = true;
}

/** Places the HTML labels over the canvas: project, avoid collisions and the edges, hide the rest. */
function positionLabels(stage: Stage, specs: readonly LabelSpec[], elements: ReadonlyMap<string, HTMLSpanElement>) {
  const { camera, width, height } = stage;
  const v = new Vector3();
  const boxes: { id: string; x: number; y: number; width: number; height: number; priority: number }[] = [];
  for (const spec of specs) {
    const el = elements.get(spec.id);
    if (!el) continue;
    v.set(spec.at[0], spec.at[1], spec.at[2]).project(camera);
    if (v.z < -1 || v.z > 1) continue;
    const sx = ((v.x + 1) / 2) * width;
    const sy = ((1 - v.y) / 2) * height;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let x = spec.field ? sx - w / 2 : sx + 9;
    if (!spec.field && x + w > width - 4) x = sx - 9 - w;
    if (spec.field) x = Math.min(Math.max(x, 4), width - 4 - w);
    const y = sy - h / 2;
    if (x < 4 || y < 4 || y + h > height - 4) continue;
    boxes.push({ id: spec.id, x, y, width: w, height: h, priority: spec.priority });
  }
  const shown = new Set(placeLabels(boxes, 40));
  const at = new Map(boxes.map((b) => [b.id, b]));
  for (const [id, el] of elements) {
    const box = at.get(id);
    if (box && shown.has(id)) {
      el.style.transform = `translate(${Math.round(box.x)}px, ${Math.round(box.y)}px)`;
      el.style.visibility = "visible";
    } else {
      el.style.visibility = "hidden";
    }
  }
}
