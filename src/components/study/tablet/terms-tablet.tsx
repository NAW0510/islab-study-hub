"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, ArrowUpRight, Expand, FolderTree, List, Maximize, Plus, Rotate3d, X } from "lucide-react";
import { termDetail } from "@/lib/actions/vocab";
import { callAction } from "@/lib/call-action";
import { weekNumberFor } from "@/lib/report-template";
import { TABLET_CONFIG } from "@/lib/study/tablet/config";
import { mapToPlane, type PlaneRegion, type PlaneTerm } from "@/lib/study/tablet/map2d";
import { currentScheme, onSchemeChange, type Scheme } from "@/lib/theme";
import type { SubjectRef, TopicRef, VocabDomain, VocabTerm } from "@/lib/types";
import { cn, todayISO } from "@/lib/utils";
import { domainIndex, domainPath, type DomainIndex } from "@/lib/vocab/format";
import { visible3d, type Layout3dData } from "@/lib/vocab/map3d-model";
import { extrasOf, fieldOf, firstSentence, type MapPoint } from "@/lib/vocab/map-model";
import { decideWorldMode, probeWebGL2 } from "@/lib/vocab/library/world-mode";
import { asDomainColor, DOMAIN_TONE_CLASS } from "@/lib/vocab/seed-domains";
import { SlideGroup } from "../../slide-group";
import { useToast } from "../../toast";
import type { Theme } from "../../vocab/map/scenes/common";
import { defaultView, VIEW_KEYS, viewInfo, VIEWS, type View3d } from "../../vocab/map/scenes/views";
import { useLayout3d } from "../../vocab/map/use-layout-3d";
import { remember, remembered, THEME_KEY, VIEW_KEY } from "../../vocab/map/view-memory";
import { QuickAdd } from "../../vocab/quick-add";
import { drawFront } from "../../vocab/library/world/card-texture";
import { colorReader, coverColors, fogOf, uiColors, type ColorReader } from "../../vocab/library/world/palette";
import type { Tablet, TabletColors, TabletHover, TabletMap, TabletView } from "./tablet";
import { loadTablet } from "./tablet-load";

export type TabletClosing = { to: () => DOMRect | null; style: "fly" | "dive"; done: () => void };

const { map2d: MAP, ui: UI } = TABLET_CONFIG;
const SHEET = { width: 560, height: 294 };
const NO_FIELDS = new Set<string>();
const toCss = ([r, g, b]: [number, number, number]) =>
  `#${[r, g, b].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("")}`;

/** A term's fields, its primary field first. */
function fieldsOfPoint(p: MapPoint, domains: DomainIndex): string[] {
  const out: string[] = [];
  for (const id of [p.domain_id, ...extrasOf(p)]) {
    const f = id ? fieldOf(id, domains) : null;
    if (f && !out.includes(f.id)) out.push(f.id);
  }
  return out;
}

/**
 * The Istilah Teknis book, open in the Perpustakaan (?buku=istilah): a
 * tablet projecting the Peta Otak as a hologram, flat (2D, first) or as one
 * of the Peta Otak 3D's views (Luar angkasa, Otak, Kubus: the full screen's
 * own scenes, turned by hand like there). Everything the book does is here:
 * add a term in place, open the list, the domains or the full map; a field
 * (its region, or its name in the legend) opens its room in the
 * Perpustakaan, a term opens its panel.
 *
 * A 3D view brings its own scheme, as in full screen: Luar angkasa is dark,
 * Otak light, Kubus the Gelap/Terang chosen there (else the app's). The whole
 * overlay and the top bar take it (data-holo-scheme on <html>) until the
 * view goes or the book closes.
 *
 * With hardware WebGL2 and motion allowed, the book turns into the tablet
 * (tablet.ts); otherwise the same frame shows the flat map as SVG. `from`
 * is where the Istilah Teknis sheet rested; without it the tablet comes back
 * already open (from a room, a page, a direct visit). `closing` plays the
 * way out: back onto the shelf (`fly`) or into a room or a page (`dive`).
 */
export function TermsTablet({
  points,
  domains,
  terms,
  subjects,
  topics,
  programStart,
  onExit,
  onOpenField,
  onOpenTerm,
  from,
  closing,
  coverMeta,
  onCovered,
  onLifted,
}: {
  points: MapPoint[];
  domains: VocabDomain[];
  terms: VocabTerm[];
  subjects: SubjectRef[];
  topics: TopicRef[];
  programStart: string;
  onExit: () => void;
  onOpenField: (fieldId: string) => void;
  onOpenTerm: (termId: string) => void;
  from: DOMRect | null;
  closing: TabletClosing | null;
  coverMeta: string;
  onCovered: (covered: boolean) => void;
  onLifted: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const tabletRef = useRef<Tablet | null>(null);
  const readerRef = useRef<ColorReader | null>(null);
  const [mode, setMode] = useState<"pending" | "gl" | "dom">("pending");
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<TabletView>("2d");
  const [wanted3d, setWanted3d] = useState(false);
  const [live, setLive] = useState(false);
  const appScheme = useSyncExternalStore(onSchemeChange, currentScheme, (): Scheme => "light");
  // The full screen's last view and Kubus theme (shared), so "Layar penuh" opens on the same one.
  const [view3d, setView3d] = useState<View3d>(() => remembered(VIEW_KEY, VIEW_KEYS, defaultView(currentScheme() === "dark")));
  const [cubeTheme] = useState<Theme>(() => remembered(THEME_KEY, ["dark", "light"], currentScheme()));
  const [autoRotate, setAutoRotate] = useState(true);
  const [layout, setLayout] = useState<Layout3dData | null>(null);
  const [layoutStatus, setLayoutStatus] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const wide = useSyncExternalStore(subscribeWide, isWide, () => false);

  const domainIdx = useMemo(() => domainIndex(domains), [domains]);
  const fields = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of points) {
      const f = fieldOf(p.domain_id, domainIdx);
      if (f) counts.set(f.id, (counts.get(f.id) ?? 0) + 1);
    }
    return domains
      .filter((d) => !d.parent_id)
      .map((d) => ({ id: d.id, name: d.name, color: asDomainColor(d.color), count: counts.get(d.id) ?? 0 }))
      .filter((f) => f.count > 0)
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "id"));
  }, [points, domains, domainIdx]);
  const plane = useMemo(() => mapToPlane(points, (p) => fieldsOfPoint(p, domainIdx), MAP.SIZE, MAP.OUTLINE_SAMPLES), [points, domainIdx]);
  const byId = useMemo(() => new Map(points.map((p) => [p.id, p])), [points]);
  const existing = useMemo(() => {
    const map = new Map<string, VocabTerm>();
    for (const t of terms) {
      map.set(t.term.toLowerCase(), t);
      for (const a of t.aliases) map.set(a.toLowerCase(), t);
    }
    return map;
  }, [terms]);

  /** The flat map with its colours read from the tokens (the hologram needs real colours). */
  const tabletMap = useCallback(
    (reader: ColorReader): TabletMap => ({
      terms: plane.terms,
      regions: plane.regions,
      colors: new Map(fields.map((f) => [f.id, reader.read(`var(--${f.color})`)])),
      none: reader.read("var(--domain-none)"),
      names: new Map(fields.map((f) => [f.id, f.name])),
    }),
    [plane, fields],
  );
  const readColours = useCallback((reader: ColorReader, dark: boolean): TabletColors => {
    return {
      holo: reader.read("var(--holo)"),
      fog: toCss(fogOf(dark ? 1 : 0, 0, [0.5, 0.5, 0.5])),
      paper: reader.read("var(--paper)"),
      ink: reader.read("var(--paper-ink)"),
      deep: coverColors(reader, "domain-4").deep,
    };
  }, []);

  // ------------------------------------------------------------ mode
  useEffect(() => {
    // The library under the book has already asked the device (world-host.tsx); a direct visit asks here.
    const known = document.querySelector<HTMLElement>("[data-library-page]")?.dataset.libraryWorld;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const decided =
      known === "gl" && !reducedMotion
        ? "gl"
        : known === "dom"
          ? "dom"
          : decideWorldMode({ reducedMotion, noWorld: new URLSearchParams(window.location.search).has("noworld"), ...probeWebGL2() });
    const id = requestAnimationFrame(() => setMode(decided));
    const html = document.documentElement;
    const overflow = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(id);
      html.style.overflow = overflow;
    };
  }, []);

  // ------------------------------------------------------------ the tablet
  const latest = useRef({ onCovered, onLifted, onOpenField, plane, view, selected, wide });
  useEffect(() => {
    latest.current = { onCovered, onLifted, onOpenField, plane, view, selected, wide };
  });
  const pickTerm = useCallback((id: string | null) => {
    setAdding(false);
    setSelected(id);
  }, []);
  const pickRef = useRef(pickTerm);
  useEffect(() => {
    pickRef.current = pickTerm;
  });
  useEffect(() => {
    if (mode !== "gl") return;
    const root = rootRef.current;
    const stage = stageRef.current;
    const backdrop = backdropRef.current;
    if (!root || !stage || !backdrop) return;
    let cancelled = false;
    const reader = colorReader(root);
    readerRef.current = reader;
    performance.mark("tablet:loading");
    loadTablet()
      .then(async ({ createTablet }) => {
        if (cancelled) return;
        const sheet = document.querySelector<HTMLElement>('[data-term-id="buku-istilah"] .library-sheet');
        const size = from ? { width: from.width, height: from.height } : sheet ? sheet.getBoundingClientRect() : SHEET;
        const title = document.querySelector(".library-title");
        const meta = document.querySelector(".library-meta");
        const fonts = {
          display: title ? getComputedStyle(title).fontFamily : getComputedStyle(document.body).fontFamily,
          body: meta ? getComputedStyle(meta).fontFamily : getComputedStyle(document.body).fontFamily,
        };
        const { main, deep } = coverColors(reader, "domain-4");
        const face = drawFront({ id: "buku-istilah", term: "Istilah Teknis", meta: coverMeta, definition: "", main, deep }, uiColors(reader), fonts, size.width, size.height, 2);
        const tip = tipRef.current;
        const tablet = await createTablet({
          host: stage,
          backdrop,
          cover: face.canvas,
          aspect: size.width / Math.max(1, size.height),
          from,
          colors: readColours(reader, currentScheme() === "dark"),
          dark: currentScheme() === "dark",
          map: tabletMap(reader),
          view: latest.current.view,
          onHover: (hover: TabletHover, x: number, y: number) => {
            if (!tip) return;
            if (!hover || !hover.label) {
              tip.hidden = true;
              return;
            }
            tip.replaceChildren(hover.kind === "field" ? `${hover.label} · buka ruangnya` : hover.label);
            if (hover.detail) {
              const detail = document.createElement("span");
              detail.className = "atlas-tip-detail";
              detail.textContent = hover.detail;
              tip.append(detail);
            }
            tip.style.transform = `translate(${Math.round(x + 14)}px, ${Math.round(y + 16)}px)`;
            tip.hidden = false;
          },
          onPickTerm: (id) => pickRef.current(id),
          onPickField: (id) => latest.current.onOpenField(id),
          onStarted: () => latest.current.onLifted(),
          onCovered: () => latest.current.onCovered(true),
          onSettled: () => setReady(true),
        });
        if (cancelled) return tablet.dispose();
        tabletRef.current = tablet;
        setLive(true);
        const { selected: first, wide: isWide } = latest.current;
        tablet.setInsets(isWide ? UI.LEFT : 0, first && isWide ? UI.PANEL : 0, !isWide && first ? Math.round(window.innerHeight * 0.58) + 12 : 0, first ? navHeight() : 0);
        if (first) tablet.focusTerm(first);
      })
      .catch(() => {
        if (!cancelled) setMode("dom");
      });
    return () => {
      cancelled = true;
      tabletRef.current?.dispose();
      tabletRef.current = null;
      reader.dispose();
      readerRef.current = null;
    };
    // Built once per opening; later changes reach it through its methods.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Without the tablet's scene: the fog fades in, then the flat map is there.
  useEffect(() => {
    if (mode !== "dom") return;
    const backdrop = backdropRef.current;
    if (!backdrop) return;
    const reader = colorReader(rootRef.current ?? document.body);
    backdrop.style.backgroundColor = readColours(reader, currentScheme() === "dark").fog;
    reader.dispose();
    backdrop.style.opacity = "1";
    const id = window.setTimeout(() => {
      latest.current.onCovered(true);
      setReady(true);
    }, 320);
    return () => window.clearTimeout(id);
  }, [mode, readColours]);

  // The overlay's scheme: a 3D view's own (as in full screen), else the app's; the book closes in the app's.
  const definition3d = viewInfo(view3d);
  const holoTheme: Theme = definition3d.theme === "choice" ? cubeTheme : definition3d.theme;
  const forced = mode === "gl" && view === "3d" && !closing ? holoTheme : null;
  const overlayDark = (forced ?? appScheme) === "dark";
  useEffect(() => {
    const root = document.documentElement;
    if (forced) root.dataset.holoScheme = forced;
    else delete root.dataset.holoScheme;
    // New terms or a new scheme: the tablet and the flat map take its colours.
    const reader = readerRef.current;
    const tablet = tabletRef.current;
    if (!reader || !tablet) return;
    reader.reset();
    tablet.setScheme(overlayDark, readColours(reader, overlayDark));
    tablet.setMap(tabletMap(reader));
  }, [forced, overlayDark, live, readColours, tabletMap]);
  useEffect(
    () => () => {
      delete document.documentElement.dataset.holoScheme;
    },
    [],
  );

  // The 3D view: the full screen's scene, built in the overlay's scheme (after the effect above).
  const thisWeek = weekNumberFor(programStart, todayISO());
  const holoVisible = useMemo(
    () => (layout ? visible3d(points, layout.coords, { programStart, week: thisWeek, hiddenFields: NO_FIELDS, domains: domainIdx }) : []),
    [layout, points, programStart, thisWeek, domainIdx],
  );
  useEffect(() => {
    const tablet = tabletRef.current;
    if (!tablet || !layout || closing) return;
    tablet.setHologram({ view: view3d, data: layout, points, visible: holoVisible, domains: domainIdx, theme: holoTheme, level: "bidang" });
  }, [live, layout, view3d, points, holoVisible, domainIdx, holoTheme, overlayDark, closing]);
  useEffect(() => {
    tabletRef.current?.setAutoRotate(autoRotate);
  }, [autoRotate, live]);

  // The picked term's nearest terms: the 3D views draw lines to them, as in full screen.
  const neighbourCache = useRef(new Map<string, { id: string; similarity: number }[]>());
  useEffect(() => {
    const tablet = tabletRef.current;
    if (!tablet || !selected || view !== "3d") return;
    const known = neighbourCache.current.get(selected);
    if (known) {
      tablet.setNeighbours(selected, known);
      return;
    }
    let alive = true;
    const id = selected;
    void callAction(() => termDetail(id)).then((result) => {
      if (!result || "error" in result) return;
      const list = result.neighbours.map((n) => ({ id: n.id, similarity: n.similarity }));
      neighbourCache.current.set(id, list);
      if (alive) tabletRef.current?.setNeighbours(id, list);
    });
    return () => {
      alive = false;
    };
  }, [selected, view, live]);

  useEffect(() => {
    tabletRef.current?.setView(view);
  }, [view, live]);
  useEffect(() => {
    tabletRef.current?.highlightField(highlight);
  }, [highlight]);
  useEffect(() => {
    if (tipRef.current) tipRef.current.hidden = true;
    const tablet = tabletRef.current;
    if (!tablet) return;
    const panel = selected || adding;
    const sheet = !wide && panel ? (rootRef.current?.querySelector<HTMLElement>(".atlas-panel")?.offsetHeight ?? Math.round(window.innerHeight * 0.58)) + 12 : 0;
    tablet.setInsets(wide ? UI.LEFT : 0, panel && wide ? UI.PANEL : 0, sheet, selected ? navHeight() : sideInset(rootRef.current, wide || Boolean(panel)));
    tablet.focusTerm(selected);
  }, [selected, adding, wide]);
  // The book's buttons grow with the 3D tools: on phones the picture moves down with them.
  useEffect(() => {
    const tablet = tabletRef.current;
    if (!tablet || wide || selected || adding) return;
    tablet.setInsets(0, 0, 0, sideInset(rootRef.current, false));
  }, [view, wide, live, selected, adding]);

  // The way out.
  useEffect(() => {
    if (!closing) return;
    const tablet = tabletRef.current;
    if (tipRef.current) tipRef.current.hidden = true;
    latest.current.onCovered(false);
    if (tablet) {
      const id = requestAnimationFrame(() => void tablet.close(closing.to(), closing.style).then(closing.done));
      return () => cancelAnimationFrame(id);
    }
    const backdrop = backdropRef.current;
    if (backdrop) backdrop.style.opacity = "0";
    const id = window.setTimeout(closing.done, 320);
    return () => window.clearTimeout(id);
  }, [closing]);

  // Esc: out of a panel, then out of the book.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || closing) return;
      const target = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (selected || adding) {
        setSelected(null);
        setAdding(false);
      } else onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, adding, closing, onExit]);

  const chooseView = (next: TabletView) => {
    if (next === "3d") setWanted3d(true);
    setView(next);
  };
  const chooseView3d = (next: View3d) => {
    if (tipRef.current) tipRef.current.hidden = true;
    setView3d(next);
    remember(VIEW_KEY, next);
  };
  const newThisWeek = terms.filter((t) => weekNumberFor(programStart, t.learned_on) === thisWeek).length;
  const unplaced = points.length - plane.terms.length;
  const point = selected ? byId.get(selected) : undefined;
  const panelOpen = Boolean(point) || adding;

  return (
    <div
      ref={rootRef}
      className="atlas theme-scope"
      data-mode={mode}
      data-ready={(ready && !closing) || undefined}
      data-closing={closing ? "" : undefined}
      data-panel={panelOpen ? "" : undefined}
    >
      <div ref={backdropRef} className="atlas-backdrop" aria-hidden="true" />
      <div ref={stageRef} className="atlas-stage">
        {mode === "dom" && (
          <FlatMapSvg terms={plane.terms} regions={plane.regions} fields={fields} selected={selected} highlight={highlight} onPickTerm={pickTerm} onPickField={onOpenField} />
        )}
      </div>
      <div ref={tipRef} className="atlas-tip" hidden aria-hidden="true" />
      {wanted3d && <Layout3d points={points} domainIdx={domainIdx} onData={setLayout} onStatus={setLayoutStatus} />}

      <div className="atlas-side no-scrollbar">
        <header className="atlas-head">
          <button type="button" className="btn btn-ghost btn-sm -ml-2" onClick={onExit}>
            <ArrowLeft className="size-4" aria-hidden="true" /> Semua buku
          </button>
          <p className="eyebrow mt-3">Buku</p>
          <h1 className="display text-[clamp(1.9rem,1.4rem+1.6vw,2.6rem)] leading-none">Istilah Teknis</h1>
          <p className="mt-2 text-sm text-muted">
            {terms.length} istilah · {fields.length} bidang · {newThisWeek} baru minggu ini
          </p>
          {unplaced > 0 && <p className="mt-1 text-xs text-muted">{unplaced} istilah belum punya posisi di peta.</p>}
        </header>

        {/* Everything the Istilah Teknis book does lives here. */}
        <div className="atlas-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            aria-expanded={adding}
            onClick={() => {
              setSelected(null);
              setAdding(true);
            }}
          >
            <Plus className="size-4" aria-hidden="true" /> Tambah istilah
          </button>
          {mode === "gl" && (
            <div role="group" aria-label="Tampilan hologram">
              <SlideGroup className="segmented segmented-sm">
                <button type="button" className="segmented-item" aria-pressed={view === "2d"} onClick={() => chooseView("2d")}>
                  2D
                </button>
                <button type="button" className="segmented-item" aria-pressed={view === "3d"} onClick={() => chooseView("3d")}>
                  3D
                </button>
              </SlideGroup>
            </div>
          )}
          <Link href="/studi/istilah" className="btn btn-secondary btn-sm">
            <List className="size-4" aria-hidden="true" /> Daftar
          </Link>
          <Link href="/studi/istilah/domain" className="btn btn-secondary btn-sm">
            <FolderTree className="size-4" aria-hidden="true" /> Domain
          </Link>
          <Link href={view === "3d" ? "/studi/istilah/peta/3d" : "/studi/istilah/peta"} className="btn btn-secondary btn-sm">
            <Expand className="size-4" aria-hidden="true" /> Layar penuh
          </Link>
        </div>
        {mode === "gl" && view === "3d" && (
          <div className="atlas-holo-tools">
            <div role="group" aria-label="Tampilan 3D">
              <SlideGroup className="segmented segmented-sm">
                {VIEWS.map(({ key, label }) => (
                  <button key={key} type="button" className="segmented-item" aria-pressed={view3d === key} onClick={() => chooseView3d(key)}>
                    {label}
                  </button>
                ))}
              </SlideGroup>
            </div>
            <div className="flex items-center gap-1.5">
              <button type="button" className="btn btn-ghost btn-sm" aria-pressed={autoRotate} title="Putar otomatis" onClick={() => setAutoRotate((on) => !on)}>
                <Rotate3d className="size-3.5" aria-hidden="true" /> <span className="max-[60rem]:sr-only">Putar otomatis</span>
              </button>
              <button type="button" className="icon-btn size-8" aria-label="Kembali ke tampilan awal" title="Kembali ke tampilan awal" onClick={() => tabletRef.current?.resetHologram()}>
                <Maximize className="size-4" aria-hidden="true" />
              </button>
            </div>
            <p className={cn("text-xs text-muted", !layoutStatus && "atlas-holo-hint")}>{layoutStatus ?? "Seret untuk memutar, gulir atau cubit untuk zoom."}</p>
          </div>
        )}

        {fields.length > 0 && (
          <ul className="atlas-legend" aria-label="Bidang (buka ruangnya)">
            {fields.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  className="atlas-legend-item"
                  title={`Buka ruang ${f.name}`}
                  onPointerEnter={() => setHighlight(f.id)}
                  onPointerLeave={() => setHighlight(null)}
                  onFocus={() => setHighlight(f.id)}
                  onBlur={() => setHighlight(null)}
                  onClick={() => onOpenField(f.id)}
                >
                  <span className={cn("chip-tone size-2.5 shrink-0 rounded-full p-0", DOMAIN_TONE_CLASS[f.color])} style={{ backgroundColor: `var(--${f.color})` }} />
                  <span className="flex-1 truncate">{f.name}</span>
                  <span className="text-xs text-muted tabular-nums">{f.count}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {mode === "gl" && view === "3d" && definition3d.credit && (
        <p className="atlas-credit">
          {definition3d.credit.lead}{" "}
          <a className="underline underline-offset-2 hover:text-text" href={definition3d.credit.titleUrl} target="_blank" rel="noreferrer">
            {definition3d.credit.title}
          </a>{" "}
          karya{" "}
          <a className="underline underline-offset-2 hover:text-text" href={definition3d.credit.authorUrl} target="_blank" rel="noreferrer">
            {definition3d.credit.author}
          </a>
          ,{" "}
          <a className="underline underline-offset-2 hover:text-text" href={definition3d.credit.licenseUrl} target="_blank" rel="noreferrer">
            {definition3d.credit.license}
          </a>
        </p>
      )}

      {point && !adding && (
        <section className="atlas-panel" aria-label={point.term} key={point.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow">{point.domain_id ? domainPath(point.domain_id, domainIdx) : "Tanpa domain"}</p>
              <h2 className="display mt-1 text-[1.75rem] leading-tight text-balance">{point.term}</h2>
              {point.aliases.length > 0 && <p className="mt-1 text-sm text-muted">{point.aliases.join(", ")}</p>}
            </div>
            <button type="button" className="icon-btn -mt-1 -mr-2 size-9 shrink-0" aria-label="Tutup istilah" onClick={() => setSelected(null)}>
              <X className="size-4" />
            </button>
          </div>
          <div className="atlas-panel-body mt-4">
            <p className="text-[0.9375rem] text-text-2">{point.snippet ? firstSentence(point.snippet, 200) : "Belum ada definisi."}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {extrasOf(point).map((id) => {
                const d = domainIdx.get(id);
                return d ? (
                  <span key={id} className={cn("chip chip-tone", DOMAIN_TONE_CLASS[asDomainColor((d.parent_id ? domainIdx.get(d.parent_id) : d)?.color)])}>
                    {domainPath(id, domainIdx)}
                  </span>
                ) : null;
              })}
              <span className="chip bg-surface-2 text-muted">W{weekNumberFor(programStart, point.learned_on)}</span>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => onOpenTerm(point.id)}>
                Buka halaman istilah
              </button>
              <Link href={`/studi/istilah?term=${point.id}`} className="btn btn-secondary btn-sm">
                Ubah di Daftar <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {adding && (
        <section className="atlas-panel" aria-label="Tambah istilah">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow">Istilah Teknis</p>
              <h2 className="display mt-1 text-[1.75rem] leading-tight">Tambah istilah</h2>
              <p className="mt-1 text-sm text-muted">Titiknya muncul di peta setelah diproses.</p>
            </div>
            <button type="button" className="icon-btn -mt-1 -mr-2 size-9 shrink-0" aria-label="Tutup" onClick={() => setAdding(false)}>
              <X className="size-4" />
            </button>
          </div>
          <div className="atlas-panel-body mt-4">
            <QuickAdd
              domains={domains}
              subjects={subjects}
              topics={topics}
              existing={existing}
              onSaved={(result) => {
                toast({ message: `“${result.term.term}” disimpan.` });
                router.refresh();
              }}
              onOpenExisting={(id) => pickTerm(byId.has(id) ? id : null)}
            />
          </div>
        </section>
      )}
    </div>
  );
}

/** The Peta Otak 3D's layout (cached, or computed in a worker as in full screen), handed up once ready. */
function Layout3d({
  points,
  domainIdx,
  onData,
  onStatus,
}: {
  points: MapPoint[];
  domainIdx: DomainIndex;
  onData: (data: Layout3dData) => void;
  onStatus: (status: string | null) => void;
}) {
  const { state } = useLayout3d(points, domainIdx);
  useEffect(() => {
    if (state.phase === "computing") onStatus(`Menyusun ruang 3D… ${Math.round(state.progress * 100)}%`);
    else if (state.phase === "loading") onStatus("Menyiapkan ruang 3D…");
    else if (state.phase === "error") onStatus(`Ruang 3D gagal disusun: ${state.message}`);
    else onStatus(null);
    if (state.phase === "ready") onData(state.data);
  }, [state, onData, onStatus]);
  return null;
}

/** The flat Peta Otak as SVG, for devices without the tablet's scene. */
function FlatMapSvg({
  terms,
  regions,
  fields,
  selected,
  highlight,
  onPickTerm,
  onPickField,
}: {
  terms: PlaneTerm[];
  regions: PlaneRegion[];
  fields: { id: string; name: string; color: string }[];
  selected: string | null;
  highlight: string | null;
  onPickTerm: (id: string | null) => void;
  onPickField: (id: string) => void;
}) {
  const colour = new Map(fields.map((f) => [f.id, `var(--${f.color})`]));
  const name = new Map(fields.map((f) => [f.id, f.name]));
  const h = MAP.SIZE / 2 + 0.2;
  return (
    <svg viewBox={`${-h} ${-h} ${2 * h} ${2 * h}`} className="tablet-svg" role="img" aria-label="Peta Otak" onClick={() => onPickTerm(null)}>
      {regions.map((r) => (
        <path
          key={r.fieldId}
          d={`M${r.ring.map(([x, y]) => `${x.toFixed(3)} ${(-y).toFixed(3)}`).join("L")}Z`}
          style={{ fill: colour.get(r.fieldId), stroke: colour.get(r.fieldId) }}
          data-highlight={highlight === r.fieldId || undefined}
          className="tablet-region"
          onClick={(e) => {
            e.stopPropagation();
            onPickField(r.fieldId);
          }}
        >
          <title>{`${name.get(r.fieldId) ?? ""} · buka ruangnya`}</title>
        </path>
      ))}
      {terms.map((t) => (
        <circle
          key={t.id}
          cx={t.x}
          cy={-t.y}
          r={selected === t.id ? 0.07 : 0.035}
          style={{ fill: t.fieldId ? colour.get(t.fieldId) : "var(--domain-none)" }}
          className="tablet-point"
          onClick={(e) => {
            e.stopPropagation();
            onPickTerm(t.id);
          }}
        >
          <title>{t.term}</title>
        </circle>
      ))}
    </svg>
  );
}

/**
 * Phones: the book's buttons run across the top, over the hologram; the
 * picture is centred a little lower (a top inset of part of what they cover).
 */
function sideInset(root: HTMLElement | null, skip: boolean) {
  const side = root?.querySelector<HTMLElement>(".atlas-side");
  if (skip || !side) return 0;
  return Math.round(Math.max(0, side.getBoundingClientRect().bottom - navHeight()) * UI.SIDE_SHARE);
}

/** The top bar's height (it measures itself into --nav-h), the space a focused term keeps clear of. */
const navHeight = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-h")) || 0;

const WIDE_QUERY = `(min-width: ${UI.WIDE}px)`;
function subscribeWide(onChange: () => void) {
  const media = window.matchMedia(WIDE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const isWide = () => window.matchMedia(WIDE_QUERY).matches;
