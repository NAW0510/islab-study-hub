"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { ArrowLeft, BookA, Search, X } from "lucide-react";
import { weekNumberFor } from "@/lib/report-template";
import type { VocabDomain, VocabTerm } from "@/lib/types";
import { useUrlFilters } from "@/lib/use-url-filters";
import { excerpt, normalizeSearch } from "@/lib/utils";
import { domainIndex, domainPath } from "@/lib/vocab/format";
import { asDomainColor, type DomainColor } from "@/lib/vocab/seed-domains";
import { EmptyState } from "../../ui";
import { VocabTabs } from "../vocab-tabs";
import { FilterSheet, type FilterOption } from "./filter-sheet";
import { LibraryCard, type LibraryCardData } from "./library-card";
import { useLibraryWorld } from "./world-host";

type Filters = { q?: string; domain?: string };

/** "Tanpa domain" as a field of its own on the shelf. */
const NONE = "none";

type Field = { id: string; name: string; color: DomainColor; count: number; branches: VocabDomain[] };
type TermCard = LibraryCardData & { field: string; branch: string | null; hay: string };

/**
 * Kosakata › Perpustakaan. Two levels:
 *
 *   the shelf   one sheet per field (its cover in the field's colour, how many
 *               terms and branches); searching here finds terms in every field;
 *   a room      ?bidang=<id>: that field's terms as sheets, newest first, in a
 *               library that takes the field's colour; Filter picks a branch.
 *
 * Going in or out plays a transition (the world pans away under a wash of
 * the field's colour; without the world a plain wash slides across), and
 * the browser's back button walks the same way. This DOM page is complete
 * on its own; the WebGL world, when the device allows it, draws over it.
 */
export function LibraryPage({
  terms,
  domains,
  programStart,
  initial,
}: {
  terms: VocabTerm[];
  domains: VocabDomain[];
  programStart: string;
  initial: Filters;
}) {
  const { filters: f, update } = useUrlFilters(initial);
  const params = useSearchParams();
  const fieldParam = params.get("bidang");
  const [shown, setShown] = useState<string | null>(fieldParam);
  const searchRef = useRef<HTMLInputElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const riverRef = useRef<HTMLUListElement>(null);
  const washRef = useRef<HTMLDivElement>(null);
  const themeRef = useRef<string | null>(null);
  const shelfScroll = useRef(0);
  const pushed = useRef(false);
  const world = useLibraryWorld(pageRef, headRef, riverRef, themeRef);
  const domainIdx = useMemo(() => domainIndex(domains), [domains]);

  // "/" focuses the search, unless the user is already typing somewhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) && !target.isContentEditable) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The head sticks under the phone's top bar (the shell's sticky header), and at the top on wide screens.
  useEffect(() => {
    const shellHeader = document.querySelector<HTMLElement>("[data-shell-header]");
    const head = headRef.current;
    if (!head) return;
    const place = () => head.style.setProperty("--library-top", `${shellHeader?.offsetHeight ?? 0}px`);
    place();
    const observer = new ResizeObserver(place);
    if (shellHeader) observer.observe(shellHeader);
    return () => observer.disconnect();
  }, []);

  const { cards, fields } = useMemo(() => {
    const byField = new Map<string, Field>();
    for (const d of domains) {
      if (!d.parent_id) byField.set(d.id, { id: d.id, name: d.name, color: asDomainColor(d.color), count: 0, branches: [] });
    }
    for (const d of domains) if (d.parent_id) byField.get(d.parent_id)?.branches.push(d);
    const none: Field = { id: NONE, name: "Tanpa domain", color: "domain-none", count: 0, branches: [] };
    byField.set(NONE, none);
    const list: TermCard[] = terms.map((t) => {
      const own = t.domain_id ? domainIdx.get(t.domain_id) : undefined;
      const field = byField.get(own ? (own.parent_id ?? own.id) : NONE) ?? none;
      field.count += 1;
      return {
        id: t.id,
        term: t.term,
        meta: `${t.domain_id ? domainPath(t.domain_id, domainIdx) || "Tanpa domain" : "Tanpa domain"} · W${weekNumberFor(programStart, t.learned_on)}`,
        color: field.color,
        definition: t.definition.trim() ? excerpt(t.definition, 360) : "",
        field: field.id,
        branch: own?.parent_id ? own.id : null,
        hay: normalizeSearch(`${t.term} ${t.aliases.join(" ")} ${t.definition.slice(0, 5000)}`),
      };
    });
    const sorted = [...byField.values()]
      .filter((x) => x.id !== NONE || x.count > 0)
      .sort((a, b) => (a.id === NONE ? 1 : b.id === NONE ? -1 : b.count - a.count || a.name.localeCompare(b.name, "id")));
    return { cards: list, fields: sorted };
  }, [terms, domains, domainIdx, programStart]);

  const field = shown ? (fields.find((x) => x.id === shown) ?? null) : null;
  useEffect(() => {
    themeRef.current = field ? `var(--${field.color})` : null;
  }, [field]);

  const words = normalizeSearch(f.q ?? "").split(/\s+/).filter(Boolean);
  const matches = (c: TermCard) => words.every((w) => c.hay.includes(w));
  const branchOk = (c: TermCard) => !f.domain || (f.domain === "umum" ? c.branch === null : c.branch === f.domain);
  const shownTerms = field
    ? cards.filter((c) => c.field === field.id && branchOk(c) && matches(c))
    : words.length > 0
      ? cards.filter(matches)
      : [];

  // ------------------------------------------------------------ transitions
  const play = useCallback(
    (kind: "open" | "close", colour: string, swapList: () => void) => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return swapList();
      // The DOM head and controls leave with the scene and come back with the new room (.library-page[data-transition]).
      const page = pageRef.current;
      const mark = (phase: "out" | "in" | null) => {
        if (!page) return;
        if (phase) page.dataset.transition = `${kind}-${phase}`;
        else delete page.dataset.transition;
      };
      const swap = () => {
        swapList();
        mark("in");
      };
      mark("out");
      if (world.current) {
        void world.current.transition(kind, colour, swap).then(() => mark(null));
        return;
      }
      // Without the world: a plain wash slides across, the page swaps under it, then it fades.
      const wash = washRef.current;
      if (!wash) {
        swap();
        return mark(null);
      }
      wash.style.background = colour;
      wash.hidden = false;
      wash
        .animate([{ transform: `translateX(${kind === "open" ? "100%" : "-100%"})` }, { transform: "translateX(0)" }], {
          duration: 420,
          easing: "cubic-bezier(0.65, 0, 0.35, 1)",
          fill: "forwards",
        })
        .finished.then(() => {
          swap();
          return wash.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, delay: 120, easing: "ease-out", fill: "forwards" }).finished;
        })
        .then(() => {
          wash.hidden = true;
          wash.getAnimations().forEach((a) => a.cancel());
          mark(null);
        })
        .catch(() => mark(null));
    },
    [world],
  );

  // The URL leads (a click, the back button, a shared link); the shown room follows it through a transition.
  useEffect(() => {
    if (fieldParam === shown) return;
    const target = fieldParam ? fields.find((x) => x.id === fieldParam) : null;
    const from = shown ? fields.find((x) => x.id === shown) : null;
    const opening = Boolean(fieldParam);
    const colour = `var(--${(target ?? from)?.color ?? "domain-none"})`;
    play(opening ? "open" : "close", colour, () => {
      if (opening && !shown) shelfScroll.current = window.scrollY;
      setShown(fieldParam);
      world.current?.setTheme(target ? `var(--${target.color})` : null);
      requestAnimationFrame(() => window.scrollTo({ top: opening ? 0 : shelfScroll.current, behavior: "instant" }));
    });
  }, [fieldParam, shown, fields, play, world]);

  const enter = (id: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    const url = new URL(window.location.href);
    url.searchParams.set("bidang", id);
    url.searchParams.delete("q");
    url.searchParams.delete("domain");
    pushed.current = true;
    window.history.pushState(null, "", url);
    update({ q: undefined, domain: undefined });
  };
  const leave = () => {
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("bidang");
    url.searchParams.delete("q");
    url.searchParams.delete("domain");
    window.history.pushState(null, "", url);
    update({ q: undefined, domain: undefined });
  };

  const fieldCard = (x: Field): LibraryCardData => ({
    id: x.id,
    term: x.name,
    meta: `${x.count} istilah${x.branches.length ? ` · ${x.branches.length} cabang` : ""}`,
    color: x.color,
    definition: x.branches.length ? x.branches.map((b) => b.name).join(", ") : "Belum ada cabang.",
  });

  const branchOptions: FilterOption[] = field
    ? [
        { key: null, label: "Semua cabang", count: field.count },
        ...field.branches.map((b) => ({ key: b.id, label: b.name, count: cards.filter((c) => c.branch === b.id).length })),
        ...(field.id !== NONE
          ? [{ key: "umum", label: `Langsung di ${field.name}`, count: cards.filter((c) => c.field === field.id && c.branch === null).length }]
          : []),
      ]
    : [];
  const filtering = Boolean(f.q || f.domain);
  const showingFields = !field && words.length === 0;

  return (
    <div ref={pageRef} className="library-page" data-library-page data-room={field ? field.id : undefined}>
      <VocabTabs active="library" variant="pill" />

      <div ref={headRef} className="library-head" data-library-head>
        {field && (
          <div className="flex justify-center">
            <button type="button" onClick={leave} className="btn btn-ghost btn-sm -mb-1">
              <ArrowLeft className="size-4" aria-hidden="true" /> Semua bidang
            </button>
          </div>
        )}
        <h1 className="display text-center text-[clamp(2.5rem,1.6rem+4vw,4.5rem)] text-balance">{field ? field.name : "Perpustakaan"}</h1>
        <p className="mt-1 text-center text-sm text-muted">
          {field
            ? `${field.count} istilah${field.branches.length ? ` · ${field.branches.length} cabang` : ""}`
            : "Pilih bidang untuk masuk ke ruangnya, atau cari istilah di semua bidang."}
        </p>
        <div className="mx-auto mt-4 flex w-full max-w-xl gap-2" role="search">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{field ? `Cari istilah di ${field.name}` : "Cari istilah di semua bidang"}</span>
            <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              value={f.q ?? ""}
              onChange={(e) => update({ q: e.target.value || undefined })}
              placeholder={field ? `Cari di ${field.name}  ( / )` : "Cari istilah  ( / )"}
              className="input h-11 rounded-btn pl-10"
            />
          </label>
          {field && branchOptions.length > 2 && (
            <FilterSheet options={branchOptions} active={f.domain ?? null} onPick={(key) => update({ domain: key ?? undefined })} />
          )}
        </div>
        {filtering && (
          <p className="mt-3 flex items-center justify-center gap-3 text-sm text-muted" aria-live="polite">
            {shownTerms.length} istilah ditemukan
            <button
              type="button"
              onClick={() => update({ q: undefined, domain: undefined })}
              className="inline-flex min-h-11 items-center gap-1 text-accent hover:text-accent-hover"
            >
              <X className="size-3.5" aria-hidden="true" /> Hapus filter
            </button>
          </p>
        )}
      </div>

      {terms.length === 0 ? (
        <EmptyState
          icon={BookA}
          title="Rak masih kosong"
          description="Tambahkan istilah di Kosakata › Daftar; setiap istilah menjadi satu lembar di sini."
        />
      ) : (
        !showingFields &&
        shownTerms.length === 0 && (
          <EmptyState icon={BookA} title="Tidak ada istilah yang cocok" description="Coba kata kunci lain atau hapus filter." />
        )
      )}

      {/* Always mounted, even when empty: the world watches this list. */}
      <ul ref={riverRef} className="library-river" data-library-river aria-label={showingFields ? "Bidang" : "Lembar istilah"}>
        {showingFields
          ? fields.map((x) => <LibraryCard key={x.id} card={fieldCard(x)} href={`?bidang=${x.id}`} onOpen={enter(x.id)} />)
          : shownTerms.map((card) => <LibraryCard key={card.id} card={card} />)}
      </ul>

      {(showingFields ? fields.length > 0 : shownTerms.length > 0) && (
        <footer className="library-end" data-library-end>
          <p className="eyebrow justify-center">{field ? `Ujung ${field.name}` : showingFields ? "Ujung rak" : "Ujung pencarian"}</p>
          <h2 className="display mt-3 text-[clamp(1.75rem,1.2rem+2.4vw,2.75rem)] text-balance">
            {field ? `Kamu sudah sampai ujung ${field.name}` : showingFields ? "Itu semua bidangmu" : "Itu semua yang cocok"}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {field
              ? filtering
                ? `${shownTerms.length} dari ${field.count} istilah cocok dengan filtermu.`
                : `${field.count} istilah, dari yang terbaru sampai yang pertama.`
              : showingFields
                ? `${fields.length} bidang, ${cards.length} istilah.`
                : `${shownTerms.length} dari ${cards.length} istilah.`}
          </p>
          {field ? (
            <button type="button" onClick={leave} className="btn btn-primary mt-6">
              <ArrowLeft className="size-4" aria-hidden="true" /> Kembali ke semua bidang
            </button>
          ) : (
            <Link href="/" className="btn btn-primary mt-6">
              Kembali ke dashboard
            </Link>
          )}
          <p className="mt-10 text-xs text-muted">
            Konsep perpustakaan terinspirasi halaman{" "}
            <a href="https://labmgm.org/articles" className="underline hover:text-text" target="_blank" rel="noreferrer">
              Articles MGM Laboratory
            </a>
            .
          </p>
        </footer>
      )}

      {/* The wash for the transitions when the world isn't running. */}
      <div ref={washRef} className="library-wash" aria-hidden="true" hidden />
    </div>
  );
}
