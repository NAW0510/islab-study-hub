"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { forceCollide, forceSimulation, forceX, forceY, type Simulation } from "d3-force";
import { quadtree } from "d3-quadtree";
import { select } from "d3-selection";
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";
import { Info, Loader2, Maximize, Minus, Pause, Play, Plus, RefreshCw, Search } from "lucide-react";
import type { NearestTerm } from "@/lib/actions/vocab";
import { currentWeekInfo, weekMarker, weekNumberFor } from "@/lib/report-template";
import type { VocabDomain } from "@/lib/types";
import { cn, formatDate, normalizeSearch, todayISO } from "@/lib/utils";
import { domainIndex, domainPath } from "@/lib/vocab/format";
import { regionFor } from "@/lib/vocab/hull";
import { placeLabels, type LabelBox } from "@/lib/vocab/labels";
import { LAYOUT_CONFIG, type LayoutParams } from "@/lib/vocab/layout/config";
import type { Point } from "@/lib/vocab/layout/normalize";
import {
  fieldOf,
  firstSentence,
  groupOf,
  layoutAdvice,
  mapStats,
  visiblePoints,
  type BoundaryLevel,
  type MapPoint,
} from "@/lib/vocab/map-model";
import { asDomainColor } from "@/lib/vocab/seed-domains";
import { EmptyState } from "../../ui";
import { useToast } from "../../toast";
import { MapDetailPanel } from "./map-detail-panel";
import { useRelayout, type PlacedPoint } from "./use-relayout";

type Props = {
  points: MapPoint[];
  domains: VocabDomain[];
  programStart: string;
  layoutParams: LayoutParams | null;
};

type View = { k: number; x: number; y: number };
type Dot = { id: string; bx: number; by: number; color: string; faded: boolean };
type SimNode = { id: string; x: number; y: number; hx: number; hy: number; fx?: number | null; fy?: number | null };

const HIT_RADIUS = 14;
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 14;
/** Width of the detail panel on wide screens (`md:w-80`) and the share of the map its bottom sheet may cover on phones. */
const PANEL_WIDTH = 320;
const SHEET_SHARE = 0.62;
const DOT_SIZE = 9;
const colorVar = (domain: VocabDomain | null) => `var(--${asDomainColor(domain?.color)})`;
const dotPath = (x: number, y: number) => `M${x.toFixed(2)},${y.toFixed(2)}h0`;
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Points are drawn once; zooming only changes the parent group's transform. */
const DotsLayer = memo(function DotsLayer({ dots, register }: { dots: Dot[]; register: (id: string, el: SVGPathElement | null) => void }) {
  return (
    <g strokeLinecap="round" strokeWidth={DOT_SIZE} fill="none">
      {dots.map((d) => (
        <path
          key={d.id}
          ref={(el) => register(d.id, el)}
          d={dotPath(d.bx, d.by)}
          stroke={d.color}
          strokeOpacity={d.faded ? 0.55 : 1}
          vectorEffect="non-scaling-stroke"
          className="animate-dot-in"
        />
      ))}
    </g>
  );
});

export default function BrainMap({ points, domains, programStart, layoutParams }: Props) {
  const router = useRouter();
  const toast = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const groupRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const viewRef = useRef<View>({ k: 1, x: 0, y: 0 });
  const frameRef = useRef(0);
  const dotRefs = useRef(new Map<string, SVGPathElement>());
  const simRef = useRef<Simulation<SimNode, undefined> | null>(null);
  const dragRef = useRef<{ id: string; node: SimNode | null; startX: number; startY: number; moved: boolean } | null>(null);
  const hoverRef = useRef<string | null>(null);

  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const [level, setLevel] = useState<BoundaryLevel>("bidang");
  const [hiddenFields, setHiddenFields] = useState<Set<string>>(() => new Set());
  const [hoverField, setHoverField] = useState<string | null>(null);
  const [hover, setHover] = useState<{ id: string; px: number; py: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [neighbours, setNeighbours] = useState<{ id: string; list: NearestTerm[] } | null>(null);
  const [query, setQuery] = useState("");
  const [override, setOverride] = useState<Map<string, Point> | null>(null);
  const [animating, setAnimating] = useState(false);
  const [supervised, setSupervised] = useState(Boolean(layoutParams?.supervised));
  const [showInfo, setShowInfo] = useState(false);
  const [playing, setPlaying] = useState(false);

  const domainIdx = useMemo(() => domainIndex(domains), [domains]);
  const { week: currentWeek } = currentWeekInfo(programStart, todayISO());
  const [week, setWeek] = useState(currentWeek);

  // Positions: what the server sent, or the layout just computed in this tab.
  const placedPoints = useMemo(
    () =>
      points.map((p) => {
        const moved = override?.get(p.id);
        return moved ? { ...p, map_x: moved[0], map_y: moved[1], map_placed: "layout" as const } : p;
      }),
    [points, override],
  );
  const advice = useMemo(() => layoutAdvice(placedPoints), [placedPoints]);
  const visible = useMemo(
    () => visiblePoints(placedPoints, { programStart, week, hiddenFields, domains: domainIdx }),
    [placedPoints, programStart, week, hiddenFields, domainIdx],
  );
  const stats = useMemo(() => mapStats(visible, { programStart, currentWeek, domains: domainIdx }), [visible, programStart, currentWeek, domainIdx]);

  // The current map, for the next relayout to start from.
  const current = useMemo(() => {
    const map = new Map<string, PlacedPoint>();
    for (const p of placedPoints) {
      if (p.map_x !== null && p.map_y !== null) map.set(p.id, { at: [p.map_x, p.map_y], fromLayout: p.map_placed === "layout" });
    }
    return map;
  }, [placedPoints]);
  const relayout = useRelayout({ current, domains: domainIdx, storedParams: layoutParams });

  // Map coordinates [-1, 1]² → "base" screen coordinates (before zooming). The map's y axis points up.
  const scale = (Math.min(size.w, size.h) / 2) * 0.92;
  const toBase = useCallback((p: Point): Point => [size.w / 2 + p[0] * scale, size.h / 2 - p[1] * scale], [size.w, size.h, scale]);

  const dots = useMemo<Dot[]>(
    () =>
      visible.map((p) => {
        const [bx, by] = toBase([p.map_x as number, p.map_y as number]);
        return { id: p.id, bx, by, color: colorVar(fieldOf(p.domain_id, domainIdx)), faded: p.domain_source === "pending" };
      }),
    [visible, toBase, domainIdx],
  );
  const dotById = useMemo(() => new Map(dots.map((d) => [d.id, d])), [dots]);
  const pointById = useMemo(() => new Map(placedPoints.map((p) => [p.id, p])), [placedPoints]);
  const tree = useMemo(
    () =>
      quadtree<Dot>()
        .x((d) => d.bx)
        .y((d) => d.by)
        .addAll(dots),
    [dots],
  );

  const regions = useMemo(() => {
    if (level === "none" || size.w === 0) return [];
    const groups = new Map<string, { domain: VocabDomain; points: Point[] }>();
    for (const p of visible) {
      const group = groupOf(p, level, domainIdx);
      if (!group) continue;
      const entry = groups.get(group.id) ?? { domain: group, points: [] };
      entry.points.push([p.map_x as number, p.map_y as number]);
      groups.set(group.id, entry);
    }
    return [...groups.values()].flatMap(({ domain, points: pts }) => {
      const region = regionFor(pts, toBase);
      const field = fieldOf(domain.id, domainIdx);
      return region ? [{ id: domain.id, fieldId: field?.id ?? domain.id, name: domain.name, color: colorVar(field), ...region }] : [];
    });
  }, [visible, level, domainIdx, toBase, size.w]);

  // ── Size ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((prev) => (Math.abs(prev.w - width) < 1 && Math.abs(prev.h - height) < 1 ? prev : { w: width, h: height }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Zoom and pan (the group is transformed directly; React state follows once per frame) ──
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const behavior = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([ZOOM_MIN, ZOOM_MAX])
      // A press that starts on a point drags that point instead of panning the map.
      .filter((event: Event) => event.type === "wheel" || !dragRef.current)
      .on("zoom", (event) => {
        const { k, x, y } = event.transform;
        viewRef.current = { k, x, y };
        groupRef.current?.setAttribute("transform", `translate(${x},${y}) scale(${k})`);
        cancelAnimationFrame(frameRef.current);
        frameRef.current = requestAnimationFrame(() => setView({ k, x, y }));
      });
    zoomRef.current = behavior;
    select(svg).call(behavior).on("dblclick.zoom", null);
    return () => {
      select(svg).on(".zoom", null);
      cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const flyTo = useCallback(
    (target: View) => {
      const svg = svgRef.current;
      const behavior = zoomRef.current;
      if (!svg || !behavior) return;
      const apply = (v: View) => behavior.transform(select(svg), zoomIdentity.translate(v.x, v.y).scale(v.k));
      if (reducedMotion()) return apply(target);
      const from = { ...viewRef.current };
      const started = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - started) / 450);
        const e = 1 - (1 - t) ** 3;
        apply({ k: from.k + (target.k - from.k) * e, x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e });
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },
    [],
  );

  /** Zoom buttons: scale around the middle of the map (factor 0 = back to the whole map). */
  const zoomBy = useCallback(
    (factor: number) => {
      if (factor === 0) return flyTo({ k: 1, x: 0, y: 0 });
      const { k, x, y } = viewRef.current;
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, k * factor));
      const cx = size.w / 2;
      const cy = size.h / 2;
      flyTo({ k: next, x: cx - ((cx - x) * next) / k, y: cy - ((cy - y) * next) / k });
    },
    [flyTo, size.w, size.h],
  );

  /**
   * The part of the map the detail panel leaves free: it covers the right-hand
   * side on wide screens and the lower part (a bottom sheet) on phones.
   */
  const freeArea = useCallback(() => {
    const wide = window.matchMedia("(min-width: 768px)").matches;
    return wide
      ? { x0: 0, y0: 0, x1: Math.max(size.w - PANEL_WIDTH, size.w / 3), y1: size.h }
      : { x0: 0, y0: 0, x1: size.w, y1: size.h * (1 - SHEET_SHARE) };
  }, [size.w, size.h]);

  /** Select a point and bring it to the middle of the free area, zoomed in (search, neighbour list). */
  const focusPoint = useCallback(
    (id: string, base?: Point) => {
      const dot = dotById.get(id);
      const at = base ?? (dot ? ([dot.bx, dot.by] as Point) : null);
      setSelectedId(id);
      if (!at) return;
      const area = freeArea();
      const k = Math.max(viewRef.current.k, 3);
      flyTo({ k, x: (area.x0 + area.x1) / 2 - at[0] * k, y: (area.y0 + area.y1) / 2 - at[1] * k });
    },
    [dotById, flyTo, freeArea],
  );

  /** Select a point that was clicked: only move the map if the panel would cover it. */
  const selectPoint = useCallback(
    (id: string) => {
      setSelectedId(id);
      const dot = dotById.get(id);
      if (!dot) return;
      const { k, x, y } = viewRef.current;
      const sx = dot.bx * k + x;
      const sy = dot.by * k + y;
      const area = freeArea();
      const margin = 32;
      if (sx >= area.x0 + margin && sx <= area.x1 - margin && sy >= area.y0 + margin && sy <= area.y1 - margin) return;
      flyTo({ k, x: (area.x0 + area.x1) / 2 - dot.bx * k, y: (area.y0 + area.y1) / 2 - dot.by * k });
    },
    [dotById, flyTo, freeArea],
  );

  // ── Playback of the weeks ───────────────────────────────────────────────
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

  // ── Pointer: hover, select, drag a point ────────────────────────────────
  const register = useCallback((id: string, el: SVGPathElement | null) => {
    if (el) dotRefs.current.set(id, el);
    else dotRefs.current.delete(id);
  }, []);

  const locate = (event: React.PointerEvent) => {
    const rect = (svgRef.current as SVGSVGElement).getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const { k, x, y } = viewRef.current;
    return { px, py, bx: (px - x) / k, by: (py - y) / k, k };
  };

  const stopSimulation = useCallback(() => {
    simRef.current?.stop();
    simRef.current = null;
  }, []);

  // A new set of dots is rendered at its home positions; any running physics belongs to the old set.
  useEffect(() => stopSimulation, [dots, stopSimulation]);

  function startDrag(id: string, bx: number, by: number, k: number) {
    stopSimulation();
    const nodes: SimNode[] = dots.map((d) => ({ id: d.id, x: d.bx, y: d.by, hx: d.bx, hy: d.by }));
    const node = nodes.find((n) => n.id === id) ?? null;
    if (node) {
      node.fx = bx;
      node.fy = by;
    }
    simRef.current = forceSimulation(nodes)
      .force("x", forceX<SimNode>((n) => n.hx).strength(0.14))
      .force("y", forceY<SimNode>((n) => n.hy).strength(0.14))
      .force("collide", forceCollide<SimNode>((DOT_SIZE * 0.75) / k))
      .alphaTarget(0.3)
      .on("tick", () => {
        for (const n of nodes) dotRefs.current.get(n.id)?.setAttribute("d", dotPath(n.x, n.y));
      });
    if (dragRef.current) dragRef.current.node = node;
  }

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    const { bx, by, k } = locate(event);
    const hit = tree.find(bx, by, (event.pointerType === "touch" ? HIT_RADIUS * 1.6 : HIT_RADIUS) / k);
    dragRef.current = hit ? { id: hit.id, node: null, startX: event.clientX, startY: event.clientY, moved: false } : null;
    if (hit) event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const { px, py, bx, by, k } = locate(event);
    const drag = dragRef.current;
    if (drag) {
      if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5) {
        drag.moved = true;
        setHover(null);
        startDrag(drag.id, bx, by, k);
      }
      if (drag.moved && drag.node) {
        drag.node.fx = bx;
        drag.node.fy = by;
      }
      return;
    }
    if (event.pointerType === "touch") return;
    const hit = tree.find(bx, by, HIT_RADIUS / k);
    if ((hit?.id ?? null) !== hoverRef.current || hit) {
      hoverRef.current = hit?.id ?? null;
      setHover(hit ? { id: hit.id, px, py } : null);
    }
  }

  function onPointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.moved) {
      // Let go: the point springs back home; the simulation cools down and stops by itself.
      if (drag.node) {
        drag.node.fx = null;
        drag.node.fy = null;
      }
      simRef.current?.alphaTarget(0);
    } else {
      // A tap opens the detail sheet, which says everything the tooltip would (and does not cover the point).
      setHover(null);
      selectPoint(drag.id);
    }
  }

  // ── Relayout ────────────────────────────────────────────────────────────
  async function runRelayout(fresh = false) {
    const result = await relayout.run({ supervised, fresh });
    if (!result) return;
    stopSimulation();
    setPlaying(false);

    const finish = () => {
      setOverride(result.coords);
      setAnimating(false);
      toast({ message: `Peta disusun: ${result.coords.size} istilah dalam ${(result.ms / 1000).toFixed(1)} detik.` });
      router.refresh();
    };
    const moving = dots.filter((d) => result.coords.has(d.id));
    if (reducedMotion() || moving.length === 0) return finish();

    // Glide every visible point from its old place to the new one.
    setAnimating(true);
    const targets = new Map(moving.map((d) => [d.id, toBase(result.coords.get(d.id) as Point)]));
    const started = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / LAYOUT_CONFIG.MOVE_MS);
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      for (const d of moving) {
        const [tx, ty] = targets.get(d.id) as Point;
        dotRefs.current.get(d.id)?.setAttribute("d", dotPath(d.bx + (tx - d.bx) * e, d.by + (ty - d.by) * e));
      }
      if (t < 1) requestAnimationFrame(step);
      else finish();
    };
    requestAnimationFrame(step);
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const q = normalizeSearch(query.trim());
    if (!q) return;
    const match =
      placedPoints.find((p) => p.map_x !== null && normalizeSearch(p.term) === q) ??
      placedPoints.find((p) => p.map_x !== null && normalizeSearch(`${p.term} ${p.aliases.join(" ")}`).includes(q));
    if (!match) {
      toast({ message: `“${query.trim()}” tidak ada di peta.` });
      return;
    }
    // Make sure the term is not hidden by the week slider or the legend before flying to it.
    setWeek((w) => Math.max(w, Math.min(currentWeek, weekNumberFor(programStart, match.learned_on))));
    const field = fieldOf(match.domain_id, domainIdx);
    setHiddenFields((hidden) => {
      const key = field?.id ?? "none";
      if (!hidden.has(key)) return hidden;
      const next = new Set(hidden);
      next.delete(key);
      return next;
    });
    // The match may be hidden right now (so it has no dot yet): aim at where it will appear.
    focusPoint(match.id, toBase([match.map_x as number, match.map_y as number]));
  }

  const onNeighbours = useCallback((id: string, list: NearestTerm[]) => setNeighbours({ id, list }), []);

  // ── Labels (recomputed when the view settles on a new frame) ────────────
  const screen = (bx: number, by: number): Point => [bx * view.k + view.x, by * view.k + view.y];
  const searchHit = normalizeSearch(query.trim());
  const labels = useMemo(() => {
    if (animating || size.w === 0) return { terms: [] as (LabelBox & { text: string })[], regions: [] as (LabelBox & { text: string; color: string })[] };
    const candidates: (LabelBox & { text: string; color?: string; region?: boolean })[] = [];
    // Labels never leave the canvas: region names are pushed inside it, term names flip to the
    // left of their point near the right edge, and whatever still does not fit is left out.
    const EDGE = 4;
    for (const r of regions) {
      const text = `${r.name} ${r.count}`;
      const width = text.length * 7.6 + 8; // semibold capitals with letter spacing
      const sx = r.center[0] * view.k + view.x;
      const sy = r.center[1] * view.k + view.y;
      if (sy < 0 || sy > size.h || sx < 0 || sx > size.w) continue;
      const x = Math.min(Math.max(sx - width / 2, EDGE), size.w - EDGE - width);
      if (x < EDGE) continue;
      candidates.push({ id: `region:${r.id}`, x, y: sy, width, height: 16, priority: 950, text, color: r.color, region: true });
    }
    visible.forEach((p, index) => {
      const dot = dotById.get(p.id);
      if (!dot) return;
      const sx = dot.bx * view.k + view.x;
      const sy = dot.by * view.k + view.y;
      if (sx < 0 || sy < 8 || sx > size.w || sy > size.h - 8) return;
      const priority =
        p.id === selectedId ? 1000 : p.id === hover?.id ? 900 : searchHit && normalizeSearch(p.term).includes(searchHit) ? 800 : index / visible.length;
      const width = p.term.length * 6.2 + 6;
      const x = sx + 8 + width <= size.w - EDGE ? sx + 8 : sx - 8 - width;
      if (x < EDGE) return;
      candidates.push({ id: p.id, x, y: sy, width, height: 15, priority, text: p.term });
    });
    const shown = new Set(placeLabels(candidates, 80));
    const kept = candidates.filter((c) => shown.has(c.id));
    return {
      terms: kept.filter((c) => !c.region) as (LabelBox & { text: string })[],
      regions: kept.filter((c) => c.region) as (LabelBox & { text: string; color: string })[],
    };
  }, [animating, size.w, size.h, regions, visible, dotById, view, selectedId, hover?.id, searchHit]);

  // ── States without a map ────────────────────────────────────────────────
  if (advice.kind === "empty") {
    return (
      <EmptyState
        icon={Plus}
        title="Peta butuh beberapa istilah dulu"
        description={`Peta Otak terbentuk dari kedekatan makna antaristilah, jadi butuh minimal 5 istilah. Sekarang baru ada ${advice.total}.`}
        action={
          <Link href="/vocab" className="btn btn-primary">
            <Plus className="size-4" /> Tambah istilah
          </Link>
        }
      />
    );
  }

  const selectedDot = selectedId ? dotById.get(selectedId) : undefined;
  const hoverPoint = hover ? pointById.get(hover.id) : undefined;
  const fields = domains.filter((d) => !d.parent_id);
  const legend = [
    ...fields.map((f) => ({ id: f.id, name: f.name, color: colorVar(f) })),
    { id: "none", name: "Tanpa domain", color: "var(--domain-none)" },
  ]
    .map((f) => ({ ...f, count: visibleOrHiddenCount(placedPoints, f.id, domainIdx, programStart, week) }))
    .filter((f) => f.count > 0);
  const toggleField = (id: string) =>
    setHiddenFields((hidden) => {
      const next = new Set(hidden);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const progress = relayout.state.phase === "computing" ? Math.round(relayout.state.progress * 100) : null;

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
            placeholder="Cari istilah di peta, lalu Enter"
            aria-label="Cari istilah di peta"
            list="map-terms"
            className="input pl-9"
          />
          <datalist id="map-terms">
            {placedPoints.slice(0, 500).map((p) => (
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
        <button type="button" className="icon-btn" aria-label="Cara membaca peta" aria-expanded={showInfo} onClick={() => setShowInfo((v) => !v)}>
          <Info className="size-4" />
        </button>
      </div>
      {showInfo && (
        <div className="card space-y-2 px-4 py-3 text-sm text-muted">
          <p>
            Titik yang berdekatan dalam satu wilayah memang mirip maknanya. Jarak antarwilayah yang berjauhan tidak bisa dibaca secara
            presisi, karena UMAP menjaga struktur lokal, bukan jarak global. Seret titik untuk bermain; ia akan kembali ke tempatnya.
          </p>
          {advice.kind !== "first" && (
            <p>
              “Susun ulang” berangkat dari peta yang sekarang, supaya letak wilayah tidak berpindah.{" "}
              <button
                type="button"
                disabled={relayout.busy}
                className="font-medium text-text underline underline-offset-2 hover:text-accent disabled:opacity-60"
                onClick={() => runRelayout(true)}
              >
                Susun dari awal
              </button>{" "}
              kalau kamu ingin susunan yang benar-benar baru.
            </p>
          )}
        </div>
      )}

      {/* Banner: first layout, or the map has grown since the last one */}
      {(advice.kind === "first" || advice.kind === "stale") && (
        <div className="card flex flex-wrap items-center gap-x-4 gap-y-2 border-accent/30 bg-accent-soft/40 px-4 py-3 text-sm">
          <span className="font-medium">
            {advice.kind === "first"
              ? `Peta belum pernah disusun. ${advice.ready} istilah siap dipetakan.`
              : [
                  advice.knn > 0 && `${advice.knn} istilah ditambahkan sejak peta disusun`,
                  advice.unplaced > 0 && `${advice.unplaced} istilah belum punya posisi`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </span>
          <span className="ml-auto">
            <RelayoutButton first={advice.kind === "first"} busy={relayout.busy} progress={progress} onClick={() => runRelayout()} />
          </span>
        </div>
      )}
      {relayout.state.phase === "error" && <p className="text-sm text-danger">Gagal menyusun peta: {relayout.state.message}</p>}

      <div className="grid gap-3 lg:grid-cols-[13rem_1fr]">
        {/* Legend + stats: a column beside the map on wide screens; on phones the legend is a
            scrolling row above the map and the stats sit below it. */}
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

        {/* Map */}
        <div ref={containerRef} className="card relative order-2 h-[min(70dvh,44rem)] min-h-96 overflow-hidden">
          <svg
            ref={svgRef}
            role="img"
            aria-label={`Peta Otak: ${visible.length} istilah dalam ${regions.length} wilayah. Daftar lengkapnya ada di tab Daftar.`}
            className="absolute inset-0 size-full touch-none select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={() => {
              hoverRef.current = null;
              setHover(null);
            }}
          >
            <g ref={groupRef}>
              {!animating &&
                regions.map((r) => (
                  <path
                    key={r.id}
                    d={r.path}
                    fill={r.color}
                    fillOpacity={hoverField === r.fieldId ? 0.22 : 0.09}
                    stroke={r.color}
                    strokeOpacity={0.55}
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              {size.w > 0 && <DotsLayer dots={dots} register={register} />}
            </g>

            {/* Overlay in screen coordinates: constant size at any zoom */}
            {!animating && selectedDot && neighbours?.id === selectedId && (
              <g stroke="var(--text)" strokeLinecap="round">
                {neighbours.list.map((n) => {
                  const dot = dotById.get(n.id);
                  if (!dot) return null;
                  const [x1, y1] = screen(selectedDot.bx, selectedDot.by);
                  const [x2, y2] = screen(dot.bx, dot.by);
                  const s = Math.max(0, Math.min(1, n.similarity));
                  return <line key={n.id} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={0.6 + 2.2 * s} strokeOpacity={0.15 + 0.55 * s} />;
                })}
              </g>
            )}
            {!animating && selectedDot && (
              <circle cx={screen(selectedDot.bx, selectedDot.by)[0]} cy={screen(selectedDot.bx, selectedDot.by)[1]} r={9} fill="none" stroke="var(--text)" strokeWidth={2} />
            )}
            <g className="pointer-events-none" fontSize={11}>
              {labels.regions.map((l) => (
                <text key={l.id} x={l.x + l.width / 2} y={l.y} textAnchor="middle" dominantBaseline="middle" fill="var(--text)" fontWeight={600} letterSpacing="0.04em"
                  stroke="var(--surface)" strokeWidth={3} paintOrder="stroke" className="uppercase">
                  {l.text}
                </text>
              ))}
              {labels.terms.map((l) => (
                <text key={l.id} x={l.x} y={l.y} dominantBaseline="middle" fill="var(--text)" stroke="var(--surface)" strokeWidth={3} paintOrder="stroke"
                  fontWeight={l.id === selectedId ? 600 : 400}>
                  {l.text}
                </text>
              ))}
            </g>
          </svg>

          <div className="absolute top-2 left-2 z-10 flex flex-col rounded-control border border-border bg-surface">
            {/* On touch screens a pinch does this; only "show everything" stays. */}
            <button type="button" className="icon-btn pointer-coarse:hidden" aria-label="Perbesar peta" onClick={() => zoomBy(1.6)}>
              <Plus className="size-4" />
            </button>
            <button type="button" className="icon-btn pointer-coarse:hidden" aria-label="Perkecil peta" onClick={() => zoomBy(1 / 1.6)}>
              <Minus className="size-4" />
            </button>
            <button type="button" className="icon-btn" aria-label="Tampilkan seluruh peta" onClick={() => zoomBy(0)}>
              <Maximize className="size-4" />
            </button>
          </div>

          {size.w > 0 && visible.length === 0 && (
            <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted">
              {advice.kind === "first" ? "Tekan “Susun peta” untuk membentuk peta pertamamu." : "Tidak ada istilah untuk pilihan Week dan bidang ini."}
            </p>
          )}

          {hover && hoverPoint && (
            <div
              role="tooltip"
              className="pointer-events-none absolute z-10 w-60 rounded-card border border-border bg-surface p-3 text-xs shadow-lg"
              style={{ left: Math.min(Math.max(hover.px + 14, 8), Math.max(size.w - 248, 8)), top: Math.min(hover.py + 14, Math.max(size.h - 130, 8)) }}
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

      {/* Week slider + relayout */}
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
        <label className="flex items-center gap-2 text-xs text-muted" title="UMAP diarahkan oleh bidang dari istilah yang sudah kamu konfirmasi. Wilayah lebih rapi, tetapi tumpang tindih makna yang sebenarnya jadi tersembunyi.">
          <input type="checkbox" checked={supervised} onChange={(e) => setSupervised(e.target.checked)} className="size-4 accent-(--accent)" />
          Rapikan per bidang
        </label>
        {advice.kind === "ok" && <RelayoutButton first={false} busy={relayout.busy} progress={progress} onClick={() => runRelayout()} />}
      </div>
    </div>
  );
}

function visibleOrHiddenCount(points: MapPoint[], fieldId: string, domains: ReadonlyMap<string, VocabDomain>, programStart: string, week: number) {
  // Legend counts ignore the legend's own on/off switches (otherwise a hidden field would vanish from it).
  return visiblePoints(points, { programStart, week, hiddenFields: new Set(), domains }).filter(
    (p) => (fieldOf(p.domain_id, domains)?.id ?? "none") === fieldId,
  ).length;
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function RelayoutButton({ first, busy, progress, onClick }: { first: boolean; busy: boolean; progress: number | null; onClick: () => void }) {
  return (
    <button type="button" disabled={busy} className={cn("btn btn-sm", first ? "btn-primary" : "btn-secondary")} onClick={onClick}>
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
      {busy ? (progress !== null ? `Menyusun… ${progress}%` : "Menyiapkan…") : first ? "Susun peta" : "Susun ulang"}
    </button>
  );
}
