"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Color, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Loader2, Maximize, Moon, Pause, Play, Plus, Rotate3d, Sun } from "lucide-react";
import type { NearestTerm } from "@/lib/actions/vocab";
import { currentWeekInfo, weekMarker, weekNumberFor } from "@/lib/report-template";
import { currentScheme } from "@/lib/theme";
import type { VocabDomain } from "@/lib/types";
import { cn, formatDate, normalizeSearch, todayISO } from "@/lib/utils";
import { domainIndex, domainPath } from "@/lib/vocab/format";
import { placeLabels } from "@/lib/vocab/labels";
import { INTRO_MS, INTRO_SEEN_KEY, introCamera, introKind, seenViews, segment, shortPath, type IntroKind, type IntroPath } from "@/lib/vocab/map/intro";
import { pickNearest, visible3d, type Layout3dData, type Projected } from "@/lib/vocab/map3d-model";
import { fieldOf, firstSentence, mapStats, MIN_TERMS_FOR_MAP, type BoundaryLevel, type MapPoint } from "@/lib/vocab/map-model";
import { NavSlot } from "../../shell/nav-slot";
import { SlideGroup } from "../../slide-group";
import { EmptyState } from "../../ui";
import { useToast } from "../../toast";
import { MapBoundary, MapInfoButton, MapInfoPanel, MapLegend, MapSearch, MapStatsLine, MapToggle, ResponsiveLabel } from "./map-chrome";
import { MapDetailPanel } from "./map-detail-panel";
import { colorVar, type SceneInput, type Theme, type ViewScene } from "./scenes/common";
import { defaultView, VIEW_KEYS, viewDefinition, VIEWS_3D, type View3d } from "./scenes/registry";
import { measureSafeArea, NO_INSETS, type SafeArea } from "./safe-area";
import { useLayout3d } from "./use-layout-3d";

type Props = { points: MapPoint[]; domains: VocabDomain[]; programStart: string };
type LabelSpec = { key: string; text: string; priority: number; group: boolean; opacity?: number };

const VIEW_KEY = "peta-otak-3d:tampilan";
const THEME_KEY = "peta-otak-3d:tema";
const HIT_RADIUS = 14;
const TOUCH_HIT_RADIUS = 24;
/** Width of the detail panel on wide screens (`md:w-80`) and the share of the canvas its bottom sheet covers on phones. */
const PANEL_WIDTH = 320;
const SHEET_SHARE = 0.62;
const FLY_MS = 450;
/** The world's up, the axis the intro's camera turns round. */
const UP = new Vector3(0, 1, 0);
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// The app's scheme (the theme button, else the device) picks the first view and theme.
const prefersDark = () => currentScheme() === "dark";

function remembered<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const saved = window.localStorage.getItem(key);
    if (saved && (allowed as readonly string[]).includes(saved)) return saved as T;
  } catch {
    // no storage: use the default
  }
  return fallback;
}

function remember(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // remembering a choice is a convenience only
  }
}

function hasWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

type Stage = {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  controls: OrbitControls;
  dirty: boolean;
  width: number;
  height: number;
  flight: { fromTarget: Vector3; toTarget: Vector3; fromPos: Vector3; toPos: Vector3; start: number } | null;
  /** Scene time for orbits; only advances while things are allowed to move. */
  time: number;
};


export default function BrainMap3D({ points, domains, programStart }: Props) {
  const toast = useToast();
  const hostRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const sceneRef = useRef<{ view: View3d; scene: ViewScene } | null>(null);
  /**
   * The intro playing, if any (lib/vocab/map/intro.ts): when it started, how
   * long it lasts, the camera's way in, and where it lands. Any input skips
   * to its end.
   */
  const introRef = useRef<{
    kind: IntroKind;
    start: number;
    duration: number;
    veil: "black" | "none";
    path: IntroPath;
    target: Vector3;
    position: Vector3;
  } | null>(null);
  const veilRef = useRef<HTMLDivElement>(null);
  /** The part of the canvas the floating panels leave free (full screen). */
  const safeRef = useRef<SafeArea>(NO_INSETS);
  const labelLayerRef = useRef<HTMLDivElement>(null);
  const labelEls = useRef(new Map<string, HTMLSpanElement>());
  const labelsRef = useRef<LabelSpec[]>([]);
  const panelOpenRef = useRef(false);
  const animateRef = useRef(false);
  const followRef = useRef<string | null>(null);
  const focusRef = useRef<string | null>(null);
  const downRef = useRef<{ x: number; y: number } | null>(null);

  const [webgl] = useState(hasWebGL);
  const [view, setView] = useState<View3d>(() => remembered(VIEW_KEY, VIEW_KEYS, defaultView(prefersDark())));
  // The Gelap/Terang choice, for views whose theme is "choice".
  const [chosenTheme, setChosenTheme] = useState<Theme>(() => remembered(THEME_KEY, ["dark", "light"], prefersDark() ? "dark" : "light"));
  const [autoRotate, setAutoRotate] = useState(() => !reducedMotion());
  const [hiddenFields, setHiddenFields] = useState<Set<string>>(() => new Set());
  const [hover, setHover] = useState<{ id: string; px: number; py: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [neighbours, setNeighbours] = useState<{ id: string; list: NearestTerm[] } | null>(null);
  const [query, setQuery] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const closeInfo = useCallback(() => setShowInfo(false), []);
  const [level, setLevel] = useState<BoundaryLevel>("bidang");
  const [hoverField, setHoverField] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [hostSize, setHostSize] = useState({ w: 0, h: 0 });
  const [labelList, setLabelList] = useState<LabelSpec[]>([]);

  const definition = useMemo(() => viewDefinition(view), [view]);
  const theme: Theme = definition.theme === "choice" ? chosenTheme : definition.theme;
  const domainIdx = useMemo(() => domainIndex(domains), [domains]);
  const { week: currentWeek } = currentWeekInfo(programStart, todayISO());
  const [week, setWeek] = useState(currentWeek);

  const { state: layout, retry } = useLayout3d(points, domainIdx);
  const data: Layout3dData | null = layout.phase === "ready" ? layout.data : null;
  const coords = useMemo(() => data?.coords ?? new Map(), [data]);
  const visible = useMemo(
    () => visible3d(points, coords, { programStart, week, hiddenFields, domains: domainIdx }),
    [points, coords, programStart, week, hiddenFields, domainIdx],
  );
  const pointById = useMemo(() => new Map(points.map((p) => [p.id, p])), [points]);
  const stats = useMemo(() => mapStats(visible, { programStart, currentWeek, domains: domainIdx }), [visible, programStart, currentWeek, domainIdx]);
  const searchHit = normalizeSearch(query.trim());

  // The top bar, the head and the glass panels float over the scene, so they
  // take its scheme (Luar angkasa is always dark), not the app's.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.mapScheme = theme;
    return () => {
      delete root.dataset.mapScheme;
    };
  }, [theme]);

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
    const camera = new PerspectiveCamera(45, 1, 0.01, 200);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    const stage: Stage = { renderer, scene, camera, controls, dirty: true, width: 0, height: 0, flight: null, time: 0 };
    stageRef.current = stage;

    const resize = () => {
      safeRef.current = measureSafeArea(host);
      const { width, height } = host.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      stage.width = width;
      stage.height = height;
      renderer.setSize(width, height, false);
      applyViewOffset(stage, panelOpenRef.current, safeRef.current);
      setHostSize((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
    };
    // Fires once right after observe(), then on every size change.
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    // The free area also moves with the legend, the Week bar and the top bar (which holds the tools).
    host.closest("[data-map-stage]")?.querySelectorAll(".map-ui, .map-week").forEach((panel) => observer.observe(panel));
    const bar = document.querySelector("header.navbar");
    if (bar) observer.observe(bar);
    controls.addEventListener("change", () => {
      stage.dirty = true;
    });

    let frameId = 0;
    let last = performance.now();
    const tick = (now: number) => {
      frameId = requestAnimationFrame(tick);
      const delta = Math.min(0.1, (now - last) / 1000);
      last = now;
      const current = sceneRef.current?.scene;

      if (current) {
        // Scene time only runs while things may move; scenes may still report a change (a mesh that arrived).
        const animate = animateRef.current;
        if (animate) stage.time += delta;
        if (current.tick(stage.time, animate ? delta : 0)) stage.dirty = true;
      }
      if (stage.flight) {
        const t = Math.min(1, (now - stage.flight.start) / FLY_MS);
        const e = 1 - (1 - t) ** 3;
        controls.target.lerpVectors(stage.flight.fromTarget, stage.flight.toTarget, e);
        camera.position.lerpVectors(stage.flight.fromPos, stage.flight.toPos, e);
        if (t >= 1) stage.flight = null;
        stage.dirty = true;
      } else if (current && followRef.current) {
        // A selected body that orbits: keep it in the middle of the view.
        const at = current.positionOf(followRef.current);
        if (at) {
          const shift = at.clone().sub(controls.target);
          if (shift.lengthSq() > 1e-10) {
            controls.target.add(shift);
            camera.position.add(shift);
            stage.dirty = true;
          }
        }
      }
      const intro = introRef.current;
      if (intro && current) {
        const t = Math.min(1, (now - intro.start) / Math.max(1, intro.duration));
        current.intro?.(t, intro.kind);
        // The camera comes in from farther away, higher and further round, and settles on the view's frame:
        // a long, slow zoom while the scene turns, landing with no speed left for "Putar otomatis" to take over.
        const way = introCamera(t, intro.path);
        const offset = intro.position.clone().sub(intro.target).applyAxisAngle(UP, way.azimuth);
        const side = new Vector3().crossVectors(UP, offset);
        if (side.lengthSq() > 1e-10) offset.applyAxisAngle(side.normalize(), -way.elevation);
        controls.target.copy(intro.target);
        camera.position.copy(intro.target).addScaledVector(offset, way.distance);
        if (veilRef.current) veilRef.current.style.opacity = intro.veil === "black" ? String(1 - segment(t, 0.03, 0.3)) : "0";
        if (labelLayerRef.current) labelLayerRef.current.style.opacity = String(segment(t, intro.kind === "full" ? 0.82 : 0.6, 1));
        stage.dirty = true;
        if (t >= 1) {
          introRef.current = null;
          host.dataset.intro = "done";
        }
      }
      const moved = controls.update(delta);
      if (moved || stage.dirty) {
        renderer.render(scene, camera);
        stage.dirty = false;
        if (current) positionLabels(stage, current, labelsRef.current, labelEls.current);
      }
    };
    frameId = requestAnimationFrame(tick);

    // An intro never stands in the way: the first touch, scroll or key jumps to its end.
    const skip = () => {
      const intro = introRef.current;
      if (intro) intro.start = performance.now() - intro.duration;
    };
    window.addEventListener("pointerdown", skip, { passive: true });
    window.addEventListener("wheel", skip, { passive: true });
    window.addEventListener("keydown", skip);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("wheel", skip);
      window.removeEventListener("keydown", skip);
      observer.disconnect();
      controls.dispose();
      sceneRef.current?.scene.dispose();
      sceneRef.current = null;
      renderer.dispose();
      renderer.domElement.remove();
      stageRef.current = null;
    };
  }, [webgl]);

  // ── Colours: read the design tokens as the canvas theme resolves them ───
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

  const sceneInput = useMemo<SceneInput | null>(
    () => (data ? { data, points, visible, domains: domainIdx, color: resolve, theme, level } : null),
    [data, points, visible, domainIdx, resolve, theme, level],
  );

  const flyTo = useCallback((at: Vector3) => {
    const stage = stageRef.current;
    if (!stage) return;
    const direction = stage.camera.position.clone().sub(stage.controls.target);
    const distance = Math.min(direction.length(), 1.8);
    const toPos = at.clone().add(direction.normalize().multiplyScalar(distance));
    if (reducedMotion()) {
      stage.controls.target.copy(at);
      stage.camera.position.copy(toPos);
      stage.dirty = true;
      return;
    }
    stage.flight = { fromTarget: stage.controls.target.clone(), toTarget: at.clone(), fromPos: stage.camera.position.clone(), toPos, start: performance.now() };
  }, []);

  // ── The scene for the chosen view: swapped when the view changes, rebuilt when its input changes ──
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !sceneInput) return;
    let current = sceneRef.current;
    if (!current || current.view !== view) {
      if (current) {
        stage.scene.remove(current.scene.root);
        current.scene.dispose();
      }
      const switching = current !== null;
      current = { view, scene: viewDefinition(view).create() };
      sceneRef.current = current;
      stage.scene.add(current.scene.root);
      current.scene.build(sceneInput);
      const { target, position } = current.scene.frame();
      stage.flight = null;
      stage.controls.target.copy(target);
      stage.camera.position.copy(position);
      stage.controls.minDistance = position.distanceTo(target) * 0.12;
      stage.controls.maxDistance = position.distanceTo(target) * 3;
      stage.controls.saveState();

      // The intro: full once per view and browser session, short after that or when switching.
      let seen = new Set<string>();
      try {
        seen = seenViews(sessionStorage.getItem(INTRO_SEEN_KEY));
      } catch {
        // storage blocked: every visit is a first one
      }
      const kind = introKind({ seen: seen.has(view), switching, reducedMotion: reducedMotion() });
      const spec = viewDefinition(view).intro;
      if (kind === "instant") {
        current.scene.intro?.(1, kind);
        introRef.current = null;
        if (hostRef.current) hostRef.current.dataset.intro = "done";
      } else {
        introRef.current = {
          kind,
          start: performance.now(),
          duration: kind === "full" ? spec.fullMs : INTRO_MS.short,
          veil: kind === "full" ? spec.veil : "none",
          path: kind === "full" ? spec : shortPath(spec),
          target: target.clone(),
          position: position.clone(),
        };
        current.scene.intro?.(0, kind);
        if (hostRef.current) hostRef.current.dataset.intro = kind;
        if (kind === "full") {
          try {
            sessionStorage.setItem(INTRO_SEEN_KEY, JSON.stringify([...seen, view]));
          } catch {
            // storage blocked: fine
          }
        }
      }
    } else {
      current.scene.build(sceneInput);
    }
    stage.controls.autoRotateSpeed = viewDefinition(view).autoRotateSpeed;
    stage.dirty = true;

    // A search result that was hidden a moment ago can be flown to now.
    const pending = focusRef.current;
    const at = pending ? current.scene.positionOf(pending) : null;
    if (pending && at) {
      focusRef.current = null;
      flyTo(at);
    }
  }, [view, sceneInput, flyTo]);

  // Selected/hovered marks and neighbour lines.
  useEffect(() => {
    const stage = stageRef.current;
    const current = sceneRef.current;
    if (!stage || !current || !sceneInput) return;
    current.scene.highlight(
      {
        selectedId,
        hoverId: hover?.id ?? null,
        neighbours: neighbours?.id === selectedId ? neighbours.list.map((n) => ({ id: n.id, similarity: n.similarity })) : [],
      },
      sceneInput,
    );
    stage.dirty = true;
  }, [selectedId, hover?.id, neighbours, sceneInput, view]);

  useEffect(() => {
    const stage = stageRef.current;
    const current = sceneRef.current;
    if (!stage || !current || !sceneInput) return;
    current.scene.emphasize(hoverField, sceneInput);
    stage.dirty = true;
  }, [hoverField, sceneInput, view]);

  // Motion: the camera turns and orbits move while "Putar otomatis" is on (paused while a term is in focus).
  useEffect(() => {
    const stage = stageRef.current;
    const moving = autoRotate && !reducedMotion();
    const { moving: ownMotion = false } = viewDefinition(view);
    animateRef.current = moving && ownMotion;
    if (stage) stage.controls.autoRotate = moving && !selectedId && !hover;
    followRef.current = ownMotion ? selectedId : null;
  }, [autoRotate, selectedId, hover, view]);

  // The detail panel covers part of the canvas: shift the view so the middle of what is left is the middle of the picture.
  useEffect(() => {
    panelOpenRef.current = Boolean(selectedId);
    const stage = stageRef.current;
    if (stage) applyViewOffset(stage, panelOpenRef.current, safeRef.current);
  }, [selectedId]);

  // Labels: group names (regions, galaxies, suns, lobes) plus selected, hovered, searched and newest terms.
  useEffect(() => {
    const current = sceneRef.current?.scene;
    const specs: LabelSpec[] = (current?.groupLabels() ?? []).map((l) => ({ ...l, group: true }));
    const newest = [...visible].sort((a, b) => b.learned_on.localeCompare(a.learned_on)).slice(0, 12);
    const wanted = new Map<string, number>();
    newest.forEach((p, i) => wanted.set(p.id, (12 - i) / 13));
    if (searchHit) {
      for (const p of visible.filter((v) => normalizeSearch(v.term).includes(searchHit)).slice(0, 10)) wanted.set(p.id, 800);
    }
    if (hover) wanted.set(hover.id, 900);
    if (selectedId) wanted.set(selectedId, 1000);
    for (const [id, priority] of wanted) {
      const point = pointById.get(id);
      if (point && current?.positionOf(id)) specs.push({ key: id, text: point.term, priority, group: false });
    }
    labelsRef.current = specs;
    const stage = stageRef.current;
    if (stage) stage.dirty = true;
    // Mirror the specs into state on the next frame, so React renders their elements.
    const frame = requestAnimationFrame(() => setLabelList(specs));
    return () => cancelAnimationFrame(frame);
  }, [sceneInput, view, visible, pointById, searchHit, hover, selectedId]);

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
      const at = sceneRef.current?.scene.positionOf(id);
      if (at) flyTo(at);
      else focusRef.current = id;
    },
    [flyTo],
  );

  const chooseView = (next: View3d) => {
    setView(next);
    setHover(null);
    remember(VIEW_KEY, next);
  };
  const chooseTheme = (next: Theme) => {
    setChosenTheme(next);
    remember(THEME_KEY, next);
  };

  // ── Pointer: hover and pick (dragging belongs to OrbitControls) ─────────
  const project = (): Projected[] => {
    const stage = stageRef.current;
    const current = sceneRef.current?.scene;
    if (!stage || !current) return [];
    const out: Projected[] = [];
    for (const id of current.pickable()) {
      const at = current.positionOf(id);
      if (!at) continue;
      const v = at.clone().project(stage.camera);
      out.push({ id, x: ((v.x + 1) / 2) * stage.width, y: ((1 - v.y) / 2) * stage.height, depth: v.z });
    }
    return out;
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
  const registerLabel = useCallback((key: string, el: HTMLSpanElement | null) => {
    if (el) labelEls.current.set(key, el);
    else labelEls.current.delete(key);
  }, []);

  // ── States without a space ──────────────────────────────────────────────
  if (points.length < MIN_TERMS_FOR_MAP) {
    return (
      <EmptyState
        title="Peta butuh beberapa istilah dulu"
        description={`Peta Otak terbentuk dari kedekatan makna antaristilah, jadi butuh minimal 5 istilah. Sekarang baru ada ${points.length}.`}
        action={
          <Link href="/studi/istilah" className="btn btn-primary">
            <Plus className="size-4" /> Tambah istilah
          </Link>
        }
      />
    );
  }
  if (!webgl) {
    return (
      <EmptyState
        title="Browser ini tidak bisa menampilkan 3D"
        description="Tampilan 3D butuh WebGL, yang tidak tersedia atau dimatikan di browser ini. Tampilan 2D tetap bisa dipakai."
        action={
          <Link href="/studi/istilah/peta" className="btn btn-primary">
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
  const roleText = hover && data && definition.describe ? definition.describe(hover.id, data, pointById) : null;

  return (
    <div className="space-y-3">
      {/* The top bar's second row: the view switch next to 2D/3D, the tools at the far end. */}
      <NavSlot>
        <div role="group" aria-label="Tampilan 3D">
          <SlideGroup className="segmented segmented-sm">
            {VIEWS_3D.map(({ key, label, Icon }) => (
              <button key={key} type="button" aria-pressed={view === key} onClick={() => chooseView(key)} className="segmented-item" title={label}>
                <Icon className="size-3.5" />
                <ResponsiveLabel text={label} from="xl" />
              </button>
            ))}
          </SlideGroup>
        </div>
      </NavSlot>
      <NavSlot place="end">
        <MapSearch value={query} onChange={setQuery} onSubmit={submitSearch} label="Cari istilah di ruang 3D" listId="map3d-terms" terms={points} />
        {definition.boundaries && <MapBoundary value={level} onChange={setLevel} />}
        {definition.theme === "choice" && (
          <div role="group" aria-label="Tema kanvas">
            <SlideGroup className="segmented segmented-sm">
              {(
                [
                  { key: "dark", label: "Gelap", Icon: Moon },
                  { key: "light", label: "Terang", Icon: Sun },
                ] as const
              ).map(({ key, label, Icon }) => (
                <button key={key} type="button" aria-pressed={chosenTheme === key} onClick={() => chooseTheme(key)} className="segmented-item" title={label}>
                  <Icon className="size-3.5" />
                  <ResponsiveLabel text={label} from="2xl" />
                </button>
              ))}
            </SlideGroup>
          </div>
        )}
        <MapToggle pressed={autoRotate} onClick={() => setAutoRotate((v) => !v)} icon={<Rotate3d className="size-3.5" />} label="Putar otomatis" />
        <MapInfoButton open={showInfo} onToggle={() => setShowInfo((v) => !v)} label="Cara membaca tampilan ini" />
      </NavSlot>
      {showInfo && (
        <MapInfoPanel title={`Peta Otak 3D · ${definition.label}`} onClose={closeInfo}>
          <p>Tiap istilah satu titik di ruang tiga dimensi. Putar ruangnya untuk melihat kelompok istilah dari sisi lain.</p>
          <p>
            {definition.info} Seret untuk memutar, gulir atau cubit untuk zoom, klik kanan atau dua jari untuk menggeser. Susunan 3D dihitung dan disimpan
            di browser ini.
          </p>
          {definition.credit && (
            <p className="text-xs">
              {definition.credit.lead}{" "}
              <a className="underline underline-offset-2 hover:text-text" href={definition.credit.titleUrl} target="_blank" rel="noreferrer">
                {definition.credit.title}
              </a>{" "}
              karya{" "}
              <a className="underline underline-offset-2 hover:text-text" href={definition.credit.authorUrl} target="_blank" rel="noreferrer">
                {definition.credit.author}
              </a>
              , lisensi{" "}
              <a className="underline underline-offset-2 hover:text-text" href={definition.credit.licenseUrl} target="_blank" rel="noreferrer">
                {definition.credit.license}
              </a>
              ; {definition.credit.note}
            </p>
          )}
        </MapInfoPanel>
      )}

      <div className="grid gap-3 lg:grid-cols-[13rem_1fr]">
        <div className="map-ui order-1 min-w-0">
          <MapLegend items={legend} hidden={hiddenFields} onToggle={toggleField} onHover={setHoverField} />
        </div>

        {/* Canvas: its own theme and background, from the view's definition in scenes/registry.ts */}
        <div
          ref={hostRef}
          className={cn(
            "map-canvas theme-scope card relative order-2 h-[min(70dvh,44rem)] min-h-96 touch-none overflow-hidden text-text select-none",
            theme === "dark" ? "scheme-dark" : "scheme-light",
            definition.background,
          )}
          role="img"
          aria-label={`Peta Otak 3D, tampilan ${definition.label}: ${visible.length} istilah. Daftar lengkapnya ada di tab Daftar.`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => setHover(null)}
        >
          <span ref={probeRef} aria-hidden="true" className="hidden" />

          {/* The intro's veil: the Luar angkasa rises out of black (transform-free, opacity only). */}
          <div ref={veilRef} aria-hidden="true" className="pointer-events-none absolute inset-0 z-[1] bg-paper-ink opacity-0" />

          {/* Labels: positioned every frame from the 3D scene */}
          <div ref={labelLayerRef} className="pointer-events-none absolute inset-0 z-[2] overflow-hidden" aria-hidden="true">
            {labelList.map((l) => (
              <span
                key={l.key}
                ref={(el) => registerLabel(l.key, el)}
                style={l.opacity !== undefined && l.opacity < 1 ? { opacity: l.opacity } : undefined}
                className={cn(
                  "invisible absolute top-0 left-0 whitespace-nowrap text-text [text-shadow:0_0_3px_var(--surface),0_0_3px_var(--surface),0_0_6px_var(--surface)]",
                  l.group ? "text-[11px] font-semibold tracking-[0.04em] uppercase" : "text-[11px]",
                  l.key === selectedId && "font-semibold",
                )}
              >
                {l.text}
              </span>
            ))}
          </div>

          <div className="map-zoom absolute top-2 left-2 z-10 rounded-control border border-border bg-surface">
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
              {roleText && <p className="mt-0.5 text-muted">{roleText}</p>}
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
      <div className="map-week card flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
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
        <MapStatsLine stats={stats} />
        {layout.phase === "ready" && layout.ms !== null && (
          <span className="hidden text-xs text-muted tabular-nums 2xl:inline">Disusun dalam {(layout.ms / 1000).toFixed(1)} detik</span>
        )}
      </div>
    </div>
  );
}

/**
 * Shifts the picture so that its middle is the middle of the part the detail
 * panel leaves free: the panel covers the right on wide screens and the bottom
 * (a sheet) on phones. The camera sees a larger virtual canvas of which only
 * the visible part is drawn.
 */
function applyViewOffset(stage: Stage, panelOpen: boolean, safe: SafeArea = NO_INSETS) {
  const { camera, width: w, height: h } = stage;
  if (w === 0 || h === 0) return;
  const wide = window.matchMedia("(min-width: 768px)").matches;
  const panel = panelOpen && wide ? Math.min(PANEL_WIDTH, w / 2) : 0;
  const sheet = panelOpen && !wide ? Math.round(h * SHEET_SHARE) : 0;
  // Where the picture's middle should be: the middle of what the panels leave free.
  const cx = (safe.left + w - panel - safe.right) / 2;
  const cy = (safe.top + h - sheet - safe.bottom) / 2;
  if (Math.abs(cx - w / 2) < 0.5 && Math.abs(cy - h / 2) < 0.5) {
    camera.aspect = w / h;
    camera.zoom = 1;
    camera.clearViewOffset();
  } else {
    // A larger virtual canvas centred there, of which only the visible part is drawn.
    const vw = cx >= w / 2 ? 2 * cx : 2 * (w - cx);
    const vh = cy >= h / 2 ? 2 * cy : 2 * (h - cy);
    camera.aspect = vw / vh;
    camera.setViewOffset(vw, vh, cx >= w / 2 ? 0 : vw - w, cy >= h / 2 ? 0 : vh - h, w, h);
    // Framed for the area the top bar, the legend and the Week bar leave free, as
    // the scenes were framed for their old card (by height; a tall phone screen
    // is bounded by its width instead). An opening panel or sheet only moves it.
    const freeH = Math.max(160, h - safe.top - safe.bottom);
    const freeW = Math.max(160, w - safe.left - safe.right);
    camera.zoom = Math.min(1, Math.min(freeH, freeW / 1.1) / vh);
  }
  camera.updateProjectionMatrix();
  stage.dirty = true;
}

/** Places the HTML labels over the canvas: project, avoid collisions and the edges, hide the rest. */
function positionLabels(stage: Stage, scene: ViewScene, specs: readonly LabelSpec[], elements: ReadonlyMap<string, HTMLSpanElement>) {
  const { camera, width, height } = stage;
  const boxes: { id: string; x: number; y: number; width: number; height: number; priority: number }[] = [];
  for (const spec of specs) {
    const el = elements.get(spec.key);
    const at = scene.positionOf(spec.key);
    if (!el || !at) continue;
    const v = at.clone().project(camera);
    if (v.z < -1 || v.z > 1) continue;
    const sx = ((v.x + 1) / 2) * width;
    const sy = ((1 - v.y) / 2) * height;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let x = spec.group ? sx - w / 2 : sx + 9;
    if (!spec.group && x + w > width - 4) x = sx - 9 - w;
    if (spec.group) x = Math.min(Math.max(x, 4), width - 4 - w);
    const y = sy - h / 2;
    if (x < 4 || y < 4 || y + h > height - 4) continue;
    boxes.push({ id: spec.key, x, y, width: w, height: h, priority: spec.priority });
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
