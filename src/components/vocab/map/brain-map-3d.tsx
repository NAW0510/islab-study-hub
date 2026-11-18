"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Color, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Info, Loader2, Maximize, Moon, Pause, Play, Plus, Rotate3d, Search, Sun } from "lucide-react";
import type { NearestTerm } from "@/lib/actions/vocab";
import { currentWeekInfo, weekMarker, weekNumberFor } from "@/lib/report-template";
import { currentScheme } from "@/lib/theme";
import type { VocabDomain } from "@/lib/types";
import { cn, formatDate, normalizeSearch, todayISO } from "@/lib/utils";
import { domainIndex, domainPath } from "@/lib/vocab/format";
import { placeLabels } from "@/lib/vocab/labels";
import { pickNearest, visible3d, type Layout3dData, type Projected } from "@/lib/vocab/map3d-model";
import { fieldOf, firstSentence, mapStats, MIN_TERMS_FOR_MAP, type BoundaryLevel, type MapPoint } from "@/lib/vocab/map-model";
import { EmptyState } from "../../ui";
import { useToast } from "../../toast";
import { MapDetailPanel } from "./map-detail-panel";
import { colorVar, type SceneInput, type Theme, type ViewScene } from "./scenes/common";
import { defaultView, VIEW_KEYS, viewDefinition, VIEWS_3D, type View3d } from "./scenes/registry";
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
      const moved = controls.update(delta);
      if (moved || stage.dirty) {
        renderer.render(scene, camera);
        stage.dirty = false;
        if (current) positionLabels(stage, current, labelsRef.current, labelEls.current);
      }
    };
    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
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
    if (stage) applyViewOffset(stage, panelOpenRef.current);
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
  const roleText = hover && data && definition.describe ? definition.describe(hover.id, data, pointById) : null;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-btn border border-border-strong bg-surface p-0.5" role="group" aria-label="Tampilan 3D">
          {VIEWS_3D.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              aria-pressed={view === key}
              onClick={() => chooseView(key)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-btn px-3 text-xs font-medium transition-colors",
                view === key ? "bg-primary text-primary-fg" : "text-muted hover:text-text",
              )}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>
        <form onSubmit={submitSearch} className="relative min-w-48 flex-1" role="search">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari istilah, lalu Enter"
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
        {definition.boundaries && (
            <label className="flex items-center gap-2 text-sm text-muted">
              Batas
              <select value={level} onChange={(e) => setLevel(e.target.value as BoundaryLevel)} className="input w-auto" aria-label="Tingkat batas wilayah">
                <option value="bidang">Bidang</option>
                <option value="cabang">Cabang</option>
                <option value="none">Tanpa batas</option>
              </select>
            </label>
        )}
        {definition.theme === "choice" && (
            <div className="inline-flex rounded-btn border border-border-strong bg-surface p-0.5" role="group" aria-label="Tema kanvas">
              {(
                [
                  { key: "dark", label: "Gelap", Icon: Moon },
                  { key: "light", label: "Terang", Icon: Sun },
                ] as const
              ).map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={chosenTheme === key}
                  onClick={() => chooseTheme(key)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-btn px-3 text-xs font-medium transition-colors",
                    chosenTheme === key ? "bg-primary text-primary-fg" : "text-muted hover:text-text",
                  )}
                >
                  <Icon className="size-3.5" /> {label}
                </button>
              ))}
            </div>
        )}
        <button
          type="button"
          className={cn("btn btn-sm", autoRotate ? "btn-primary" : "btn-secondary")}
          aria-pressed={autoRotate}
          onClick={() => setAutoRotate((v) => !v)}
        >
          <Rotate3d className="size-3.5" /> Putar otomatis
        </button>
        <button type="button" className="icon-btn" aria-label="Cara membaca tampilan ini" aria-expanded={showInfo} onClick={() => setShowInfo((v) => !v)}>
          <Info className="size-4" />
        </button>
      </div>
      {showInfo && (
        <div className="card space-y-2 px-4 py-3 text-sm text-muted">
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
        </div>
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

        {/* Canvas: its own theme and background, from the view's definition in scenes/registry.ts */}
        <div
          ref={hostRef}
          className={cn(
            "theme-scope card relative order-2 h-[min(70dvh,44rem)] min-h-96 touch-none overflow-hidden text-text select-none",
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

          {/* Labels: positioned every frame from the 3D scene */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
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
