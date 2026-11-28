"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, List, Plus, X } from "lucide-react";
import { createWord } from "@/lib/actions/study";
import { weekNumberFor } from "@/lib/report-template";
import { ATLAS_CONFIG } from "@/lib/study/atlas/config";
import type { AtlasData } from "@/lib/study/atlas/geo";
import { wordsByCountry, type CountryEntry } from "@/lib/study/languages";
import { currentScheme, onSchemeChange } from "@/lib/theme";
import type { StudyLanguage, StudyWord } from "@/lib/types";
import { cn } from "@/lib/utils";
import { decideWorldMode, probeWebGL2 } from "@/lib/vocab/library/world-mode";
import { DOMAIN_TONE_CLASS } from "@/lib/vocab/seed-domains";
import { useToast } from "../../toast";
import { drawFront } from "../../vocab/library/world/card-texture";
import { colorReader, coverColors, fogOf, uiColors, type ColorReader } from "../../vocab/library/world/palette";
import { LanguageManager } from "../language-manager";
import { WordForm } from "../word-form";
import { loadAtlasData, loadAtlasMesh, loadHologram } from "./atlas-load";
import { AtlasSvg } from "./atlas-svg";
import type { Hologram, HologramColors } from "./hologram";

export type AtlasClosing = { to: () => DOMRect | null; done: () => void };

/** The Bahasa sheet's size on the shelf when it is not on screen (a direct visit). */
const SHEET = { width: 560, height: 294 };

const toCss = ([r, g, b]: [number, number, number]) =>
  `#${[r, g, b].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("")}`;

/**
 * The Bahasa book, open in the Perpustakaan (?buku=bahasa): a world map in
 * which every country you have words for is lit in its language's colour.
 * Picking a country (on the map, in the list, or ?negara=JP) frames it and
 * opens a panel with its words and a quick add.
 *
 * With hardware WebGL2 and motion allowed, the map is a hologram rising out
 * of the opened book (hologram.ts); otherwise a flat SVG map in the same
 * frame. Everything else (head, legend, country list, panel) is DOM and
 * works the same in both. `from` is where the Bahasa sheet rested, for the
 * book to lift off it; `closing` plays the way back onto the shelf.
 */
export function LanguageAtlas({
  languages,
  words,
  programStart,
  country,
  onCountry,
  onExit,
  from,
  closing,
  coverMeta,
  onCovered,
  onLifted,
}: {
  languages: StudyLanguage[];
  words: StudyWord[];
  programStart: string;
  country: string | null;
  onCountry: (code: string | null) => void;
  onExit: () => void;
  from: DOMRect | null;
  closing: AtlasClosing | null;
  coverMeta: string;
  /** The library behind is fully covered (true) or about to show again (false). */
  onCovered: (covered: boolean) => void;
  /** The book now stands where the Bahasa sheet was: the shelf can hide the sheet. */
  onLifted: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const hologramRef = useRef<Hologram | null>(null);
  const readerRef = useRef<ColorReader | null>(null);
  const [mode, setMode] = useState<"pending" | "gl" | "dom">("pending");
  const [data, setData] = useState<AtlasData | null>(null);
  const [ready, setReady] = useState(false);
  const [highlighted, setHighlighted] = useState<ReadonlySet<string> | null>(null);
  // "Tambah diksi": the add panel, in the same place as a country's panel (one or the other).
  const [adding, setAdding] = useState(false);
  const wide = useSyncExternalStore(subscribeWide, isWide, () => false);

  const entries = useMemo(() => wordsByCountry(languages, words), [languages, words]);
  const litList = useMemo(
    () =>
      [...entries.values()]
        .filter((e) => e.total > 0)
        .sort((a, b) => b.total - a.total || (data?.byCode.get(a.code)?.name ?? a.code).localeCompare(data?.byCode.get(b.code)?.name ?? b.code, "id")),
    [entries, data],
  );
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of words) m.set(w.language_id, (m.get(w.language_id) ?? 0) + 1);
    return m;
  }, [words]);

  // The lit countries' colours, as CSS colours the hologram can read.
  const litColours = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of litList) if (e.color) m.set(e.code, `var(--${e.color})`);
    return m;
  }, [litList]);

  // ------------------------------------------------------------ mode and data
  useEffect(() => {
    performance.mark("atlas:mount");
    // The library under the book has already asked the device (world-host.tsx); a direct visit asks here.
    const known = document.querySelector<HTMLElement>("[data-library-page]")?.dataset.libraryWorld;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const decided =
      known === "gl" && !reducedMotion
        ? "gl"
        : known === "dom"
          ? "dom"
          : decideWorldMode({ reducedMotion, noWorld: new URLSearchParams(window.location.search).has("noworld"), ...probeWebGL2() });
    let cancelled = false;
    // The mode is settled when the shapes arrive: nothing draws before them anyway.
    loadAtlasData()
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setMode(decided);
      })
      .catch(() => {
        if (cancelled) return;
        setMode("dom");
        toast({ message: "Peta tidak bisa dimuat. Coba muat ulang halaman." });
      });
    // The page under the book stays where it is.
    const html = document.documentElement;
    const overflow = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      cancelled = true;
      html.style.overflow = overflow;
    };
  }, [toast]);

  const readColours = useCallback((reader: ColorReader): HologramColors => {
    const dark = currentScheme() === "dark";
    const deep = coverColors(reader, "domain-9").deep;
    return {
      holo: reader.read("var(--holo)"),
      fog: toCss(fogOf(dark ? 1 : 0, 0, [0.5, 0.5, 0.5])),
      paper: reader.read("var(--paper)"),
      ink: reader.read("var(--paper-ink)"),
      deep,
    };
  }, []);

  // ------------------------------------------------------------ the hologram
  const pick = useCallback(
    (code: string | null) => {
      setAdding(false);
      onCountry(code);
    },
    [onCountry],
  );
  const onCoveredRef = useRef(onCovered);
  const onLiftedRef = useRef(onLifted);
  const onCountryRef = useRef<(code: string | null) => void>(onCountry);
  const entriesRef = useRef(entries);
  const litRef = useRef(litColours);
  const focusRef = useRef({ country, wide });
  useEffect(() => {
    onCoveredRef.current = onCovered;
    onLiftedRef.current = onLifted;
    onCountryRef.current = pick;
    entriesRef.current = entries;
    litRef.current = litColours;
    focusRef.current = { country, wide };
  });
  useEffect(() => {
    if (mode !== "gl" || !data) return;
    const root = rootRef.current;
    const stage = stageRef.current;
    const backdrop = backdropRef.current;
    if (!root || !stage || !backdrop) return;
    let cancelled = false;
    const reader = colorReader(root);
    readerRef.current = reader;
    performance.mark("atlas:loading");
    Promise.all([loadHologram(), loadAtlasMesh()])
      .then(async ([{ createHologram }, built]) => {
        if (cancelled) return;
        performance.mark("atlas:loaded");
        const sheet = document.querySelector<HTMLElement>('[data-term-id="buku-bahasa"] .library-sheet');
        const size = from ? { width: from.width, height: from.height } : sheet ? sheet.getBoundingClientRect() : SHEET;
        const title = document.querySelector(".library-title");
        const meta = document.querySelector(".library-meta");
        const fonts = {
          display: title ? getComputedStyle(title).fontFamily : getComputedStyle(document.body).fontFamily,
          body: meta ? getComputedStyle(meta).fontFamily : getComputedStyle(document.body).fontFamily,
        };
        const { main, deep } = coverColors(reader, "domain-9");
        performance.mark("atlas:cover");
        const face = drawFront(
          { id: "buku-bahasa", term: "Bahasa", meta: coverMeta, definition: "", main, deep },
          uiColors(reader),
          fonts,
          size.width,
          size.height,
          2,
        );
        const tip = tipRef.current;
        const hologram = await createHologram({
          host: stage,
          backdrop,
          data,
          mesh: built.mesh,
          cover: face.canvas,
          aspect: size.width / Math.max(1, size.height),
          from,
          colors: readColours(reader),
          dark: currentScheme() === "dark",
          onHover: (code, x, y) => {
            if (!tip) return;
            const c = code ? data.byCode.get(code) : null;
            if (!c) {
              tip.hidden = true;
              return;
            }
            const total = entriesRef.current.get(c.code)?.total ?? 0;
            tip.textContent = total ? `${c.name} · ${total} diksi` : c.name;
            tip.style.transform = `translate(${Math.round(x + 14)}px, ${Math.round(y + 16)}px)`;
            tip.hidden = false;
          },
          onPick: (code) => onCountryRef.current(code),
          onStarted: () => onLiftedRef.current(),
          onCovered: () => onCoveredRef.current(true),
          onSettled: () => setReady(true),
        });
        if (cancelled) return hologram.dispose();
        hologramRef.current = hologram;
        // What is lit and what is in focus, from the start (the lights come on during the opening).
        hologram.setLit(new Map([...litRef.current].map(([code, css]) => [code, reader.read(css)])));
        const { country: first, wide: isWide } = focusRef.current;
        hologram.setInsets(isWide ? ATLAS_CONFIG.ui.LEFT : 0, first && isWide ? ATLAS_CONFIG.ui.PANEL : 0, !isWide && first ? Math.round(window.innerHeight * 0.58) + 12 : 0, first ? navHeight() : 0);
        hologram.focus(first);
      })
      .catch(() => {
        if (!cancelled) setMode("dom");
      });
    const offScheme = onSchemeChange(() => {
      reader.reset();
      hologramRef.current?.setScheme(currentScheme() === "dark", readColours(reader));
    });
    return () => {
      cancelled = true;
      offScheme();
      hologramRef.current?.dispose();
      hologramRef.current = null;
      reader.dispose();
      readerRef.current = null;
    };
    // The hologram is built once per opening; later changes reach it through its methods.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, data]);

  // Without the hologram: the fog fades in, then the atlas is there.
  useEffect(() => {
    if (mode !== "dom") return;
    const backdrop = backdropRef.current;
    if (!backdrop) return;
    const reader = colorReader(rootRef.current ?? document.body);
    backdrop.style.backgroundColor = readColours(reader).fog;
    reader.dispose();
    backdrop.style.opacity = "1";
    const id = window.setTimeout(() => {
      onCoveredRef.current(true);
      setReady(true);
    }, 320);
    return () => window.clearTimeout(id);
  }, [mode, readColours]);

  // Lit countries, the focus and the panel reach the hologram.
  useEffect(() => {
    const hologram = hologramRef.current;
    const reader = readerRef.current;
    if (!hologram || !reader) return;
    hologram.setLit(new Map([...litColours].map(([code, css]) => [code, reader.read(css)])));
  }, [litColours, mode, data, ready]);
  useEffect(() => {
    if (tipRef.current) tipRef.current.hidden = true;
    const hologram = hologramRef.current;
    if (!hologram) return;
    // Insets first (the focus frames what the panel leaves), then the focus.
    const sheet = !wide && country ? (rootRef.current?.querySelector<HTMLElement>(".atlas-panel")?.offsetHeight ?? Math.round(window.innerHeight * 0.58)) + 12 : 0;
    hologram.setInsets(wide ? ATLAS_CONFIG.ui.LEFT : 0, country && wide ? ATLAS_CONFIG.ui.PANEL : 0, sheet, country ? navHeight() : 0);
    hologram.focus(country);
  }, [country, wide, mode, data]);
  useEffect(() => {
    hologramRef.current?.highlight(highlighted);
  }, [highlighted]);

  // The way back onto the shelf.
  useEffect(() => {
    if (!closing) return;
    const hologram = hologramRef.current;
    if (tipRef.current) tipRef.current.hidden = true;
    onCoveredRef.current(false);
    if (hologram) {
      // Wait a frame so the shelf under the fog has laid out its sheets.
      const id = requestAnimationFrame(() => void hologram.close(closing.to()).then(closing.done));
      return () => cancelAnimationFrame(id);
    }
    const backdrop = backdropRef.current;
    if (backdrop) backdrop.style.opacity = "0";
    const id = window.setTimeout(closing.done, 320);
    return () => window.clearTimeout(id);
  }, [closing]);

  // Esc: out of a country, then out of the book.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || closing) return;
      const target = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (country) onCountry(null);
      else onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [country, closing, onCountry, onExit]);

  const selected = country ? (data?.byCode.get(country) ?? null) : null;
  const showAdd = adding && !selected;
  const entry: CountryEntry | null = country ? (entries.get(country) ?? null) : null;
  const countryCount = litList.length;
  const legendCodes = (language: StudyLanguage) =>
    new Set([...language.countries, ...words.filter((w) => w.language_id === language.id && w.region).map((w) => w.region as string)]);

  return (
    <div ref={rootRef} className="atlas theme-scope" data-mode={mode} data-ready={(ready && !closing) || undefined} data-closing={closing ? "" : undefined} data-panel={selected || showAdd ? "" : undefined}>
      <div ref={backdropRef} className="atlas-backdrop" aria-hidden="true" />
      <div ref={stageRef} className="atlas-stage">
        {mode === "dom" && data && <AtlasSvg data={data} lit={litColours} selected={country} highlighted={highlighted} onPick={pick} />}
      </div>
      <div ref={tipRef} className="atlas-tip" hidden aria-hidden="true" />

      <div className="atlas-side no-scrollbar">
      <header className="atlas-head">
        <button type="button" className="btn btn-ghost btn-sm -ml-2" onClick={onExit}>
          <ArrowLeft className="size-4" aria-hidden="true" /> Semua buku
        </button>
        <p className="eyebrow mt-3">Buku</p>
        <h1 className="display text-[clamp(2.25rem,1.6rem+2.6vw,3.5rem)] leading-none">Bahasa</h1>
        <p className="mt-2 text-sm text-muted">
          {words.length} diksi · {languages.length} bahasa · {countryCount} negara menyala
        </p>
      </header>

      {/* Everything the Bahasa book does lives here: add in place, the full list, the languages. */}
      <div className="atlas-actions">
        {languages.length > 0 && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            aria-expanded={adding}
            onClick={() => {
              onCountry(null);
              setAdding(true);
            }}
          >
            <Plus className="size-4" aria-hidden="true" /> Tambah diksi
          </button>
        )}
        <Link href="/studi/bahasa" className="btn btn-secondary btn-sm">
          <List className="size-4" aria-hidden="true" /> Daftar diksi
        </Link>
        <LanguageManager languages={languages} counts={counts} compact />
      </div>

      {languages.length > 0 ? (
        <ul className="atlas-legend" aria-label="Bahasa">
          {languages.map((l) => {
            const codes = legendCodes(l);
            const on = highlighted !== null && [...codes].every((c) => highlighted.has(c)) && highlighted.size === codes.size;
            return (
              <li key={l.id}>
                <button
                  type="button"
                  className="atlas-legend-item"
                  aria-pressed={on}
                  onPointerEnter={() => setHighlighted(codes)}
                  onPointerLeave={() => setHighlighted(null)}
                  onFocus={() => setHighlighted(codes)}
                  onBlur={() => setHighlighted(null)}
                >
                  <span className={cn("chip-tone size-2.5 shrink-0 rounded-full p-0", DOMAIN_TONE_CLASS[l.color as keyof typeof DOMAIN_TONE_CLASS])} style={{ backgroundColor: `var(--${l.color})` }} />
                  <span className="flex-1 truncate">{l.name}</span>
                  <span className="text-xs text-muted tabular-nums">{counts.get(l.id) ?? 0}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="atlas-legend atlas-empty text-sm text-text-2">Belum ada bahasa. Tambahkan lewat “Kelola bahasa”.</p>
      )}
      </div>

      {litList.length > 0 && (
        <nav className="atlas-countries no-scrollbar" aria-label="Negara yang menyala">
          {litList.map((e) => (
            <button key={e.code} type="button" className="atlas-country" aria-pressed={country === e.code} onClick={() => pick(country === e.code ? null : e.code)}>
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: e.color ? `var(--${e.color})` : undefined }} />
              {data?.byCode.get(e.code)?.name ?? e.code}
              <span className="text-muted tabular-nums">{e.total}</span>
            </button>
          ))}
        </nav>
      )}

      {selected && (
        <section className="atlas-panel" aria-label={selected.name} key={selected.code}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow">{entry?.languages.map((l) => l.language.name).join(" · ") || "Negara"}</p>
              <h2 className="display mt-1 text-[1.75rem] leading-tight text-balance">{selected.name}</h2>
              <p className="mt-1 text-sm text-muted">{entry?.total ? `${entry.total} diksi` : "Belum ada diksi di sini."}</p>
            </div>
            <button type="button" className="icon-btn -mt-1 -mr-2 size-9 shrink-0" aria-label="Tutup negara" onClick={() => onCountry(null)}>
              <X className="size-4" />
            </button>
          </div>

          <div className="atlas-panel-body">
            {entry?.languages
              .filter((l) => l.words.length > 0)
              .map(({ language, words: list }) => (
                <div key={language.id} className="mt-5">
                  <h3 className={cn("chip chip-tone", DOMAIN_TONE_CLASS[language.color as keyof typeof DOMAIN_TONE_CLASS])}>{language.name}</h3>
                  <ul className="mt-2 divide-y divide-border">
                    {list.map((w) => (
                      <li key={w.id} className="py-2.5">
                        <div className="flex items-baseline gap-2">
                          <span className="font-display text-[1.0625rem] font-semibold tracking-tight" lang={language.code ?? undefined}>
                            {w.word}
                          </span>
                          {w.reading && <span className="truncate text-xs text-muted">{w.reading}</span>}
                          <span className="ml-auto shrink-0 font-display text-xs text-muted tabular-nums">W{weekNumberFor(programStart, w.learned_on)}</span>
                        </div>
                        {w.meaning && <p className="mt-0.5 text-sm text-text-2">{w.meaning}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

            <QuickAdd entry={entry} countryName={selected.name} onSaved={(w) => {
              toast({ message: `“${w.word}” disimpan.` });
              router.refresh();
            }} />
          </div>
        </section>
      )}

      {showAdd && (
        <section className="atlas-panel" aria-label="Tambah diksi">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow">Bahasa</p>
              <h2 className="display mt-1 text-[1.75rem] leading-tight">Tambah diksi</h2>
              <p className="mt-1 text-sm text-muted">Negaranya menyala di peta begitu disimpan.</p>
            </div>
            <button type="button" className="icon-btn -mt-1 -mr-2 size-9 shrink-0" aria-label="Tutup" onClick={() => setAdding(false)}>
              <X className="size-4" />
            </button>
          </div>
          <div className="atlas-panel-body mt-4">
            <WordForm
              compact
              languages={languages}
              action={createWord}
              idPrefix="atlas-add"
              onSaved={(w) => {
                toast({ message: `“${w.word}” disimpan.` });
                router.refresh();
              }}
            />
          </div>
        </section>
      )}

      <p className="atlas-credit">Peta: Natural Earth</p>
    </div>
  );
}

/** The top bar's height (it measures itself into --nav-h), the space a focused country keeps clear of. */
const navHeight = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-h")) || 0;

const WIDE_QUERY = `(min-width: ${ATLAS_CONFIG.ui.WIDE}px)`;
function subscribeWide(onChange: () => void) {
  const media = window.matchMedia(WIDE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const isWide = () => window.matchMedia(WIDE_QUERY).matches;

/** "Tambah diksi di sini": the country's languages, folded until asked for. */
function QuickAdd({ entry, countryName, onSaved }: { entry: CountryEntry | null; countryName: string; onSaved: (word: StudyWord) => void }) {
  const [adding, setAdding] = useState(false);
  if (!entry || entry.languages.length === 0) {
    return (
      <div className="mt-5 text-sm text-text-2">
        <p>Belum ada bahasa yang kamu pelajari untuk {countryName}.</p>
        <Link href="/studi/bahasa" className="btn btn-secondary btn-sm mt-3">
          Tambah bahasa untuk negara ini
        </Link>
      </div>
    );
  }
  return adding ? (
    <div className="mt-5 rounded-control border border-border p-3">
      <WordForm
        compact
        languages={entry.languages.map((l) => l.language)}
        defaultRegion=""
        action={createWord}
        idPrefix="atlas"
        onSaved={(w) => {
          setAdding(false);
          onSaved(w);
        }}
      />
    </div>
  ) : (
    <button type="button" className="btn btn-secondary btn-sm mt-5" onClick={() => setAdding(true)}>
      <Plus className="size-4" aria-hidden="true" /> Tambah diksi di sini
    </button>
  );
}
