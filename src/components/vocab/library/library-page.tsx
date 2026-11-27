"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Search, X } from "lucide-react";
import { weekNumberFor } from "@/lib/report-template";
import type { StudyLanguage, StudyWord, SubjectRef, TopicRef, VocabDomain, VocabTerm } from "@/lib/types";
import { useUrlFilters } from "@/lib/use-url-filters";
import { excerpt, normalizeSearch } from "@/lib/utils";
import { domainIndex, domainPath, termDomainIds, type DomainIndex } from "@/lib/vocab/format";
import { asDomainColor, type DomainColor } from "@/lib/vocab/seed-domains";
import { preloadAtlas } from "../../study/atlas/atlas-load";
import type { AtlasClosing } from "../../study/atlas/language-atlas";
import { EmptyState } from "../../ui";
import { FilterSheet, type FilterOption } from "./filter-sheet";
import { LibraryCard, type LibraryCardData } from "./library-card";
import { LibraryTerm, type TermPageData } from "./library-term";
import { NextThreshold } from "./next-threshold";
import { useLibraryWorld } from "./world-host";

type Filters = { q?: string; domain?: string };

/** The Bahasa book's atlas loads with the book (warmed on the way there by preloadAtlas), not with the shelf. */
const LanguageAtlas = dynamic(() => import("../../study/atlas/language-atlas").then((m) => m.LanguageAtlas), { ssr: false });

/** "Tanpa domain" as a field of its own on the shelf. */
const NONE = "none";

/** A domain's colour is its field's (a branch takes its field's colour). */
const colorOfDomain = (d: VocabDomain, domains: DomainIndex): DomainColor =>
  asDomainColor((d.parent_id ? domains.get(d.parent_id) : d)?.color);

type Field = { id: string; name: string; color: DomainColor; count: number; branches: VocabDomain[] };
/**
 * `field`/`branch` come from the primary domain (colour, cover, the "own"
 * room); `fields`/`branches` list every domain's field and branch, so a term
 * in many domains stands in every room it belongs to.
 */
type TermCard = LibraryCardData & {
  field: string;
  branch: string | null;
  fields: string[];
  branches: string[];
  hay: string;
  page: TermPageData;
};
export type Book = "istilah" | "bahasa";
type View = { book: Book | null; field: string | null; term: string | null };

/** The books on the shelf, and their covers' colours. */
const BOOK_COLOR: Record<Book, DomainColor> = { istilah: "domain-4", bahasa: "domain-9" };

/** What the URL asks for. A room or a term without ?buku= (an older link) is in Istilah Teknis. */
function readView(params: { get(name: string): string | null }): View {
  const field = params.get("bidang");
  const term = params.get("istilah");
  const raw = params.get("buku");
  const book: Book | null = raw === "bahasa" ? "bahasa" : raw === "istilah" || field || term ? "istilah" : null;
  return book === "istilah" ? { book, field, term } : { book, field: null, term: null };
}

const depthOf = (v: View) => (v.term ? 3 : v.field ? 2 : v.book ? 1 : 0);

/** The Bahasa book's contents: its languages and words, for its cover and its atlas. */
export type LanguageShelf = { languages: StudyLanguage[]; words: StudyWord[] };

/** Where a sheet rests on the shelf right now (the Bahasa book flies back onto it). */
const sheetRect = (id: string) => document.querySelector<HTMLElement>(`[data-term-id="${id}"] .library-sheet`)?.getBoundingClientRect() ?? null;

/**
 * Ruang Studi › Perpustakaan, all in one page so the WebGL world lives on
 * between its levels:
 *
 *   the books   one sheet per book: Istilah Teknis and Bahasa (?buku=);
 *   the shelf   ?buku=istilah: one sheet per field (its cover in the field's
 *               colour, how many terms and branches); searching here finds
 *               terms in every field;
 *   a room      ?bidang=<id>: that field's terms as sheets, newest first, in a
 *               library that takes the field's colour; Filter picks a branch;
 *   a term      ?istilah=<id>: the term's own page (library-term.tsx), with
 *               the pull to the next term at its end (next-threshold.tsx);
 *   the atlas   ?buku=bahasa (+ ?negara=JP): the Bahasa book opened over the
 *               library (study/atlas/language-atlas.tsx). Its sheet lifts
 *               off the shelf and becomes the book; closing lands it back.
 *
 * The URL leads (a click, the back button, a shared link) and the shown view
 * follows it through a transition: the world pans away under a wash of the
 * field's colour and the page swaps under cover (without the world, a plain
 * wash slides across). Going back returns to the same scroll. This DOM page
 * is complete on its own; the world, when the device allows it, draws over it.
 */
export function LibraryPage({
  terms,
  domains,
  subjects,
  topics,
  notes,
  programStart,
  initial,
  languages,
}: {
  terms: VocabTerm[];
  domains: VocabDomain[];
  subjects: SubjectRef[];
  topics: TopicRef[];
  notes: { id: string; title: string }[];
  programStart: string;
  initial: Filters;
  languages: LanguageShelf;
}) {
  const { filters: f, update } = useUrlFilters(initial);
  const params = useSearchParams();
  const wanted = readView(params);
  const country = wanted.book === "bahasa" ? (params.get("negara")?.toUpperCase() ?? null) : null;
  const [shown, setShown] = useState<View>(wanted);
  const [closing, setClosing] = useState<AtlasClosing | null>(null);
  const [liftedFrom, setLiftedFrom] = useState<DOMRect | null>(null);
  const [lifted, setLifted] = useState(false);
  const atlasOpen = wanted.book === "bahasa";
  const searchRef = useRef<HTMLInputElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const riverRef = useRef<HTMLUListElement>(null);
  const washRef = useRef<HTMLDivElement>(null);
  const domeRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ theme: string | null; route: "list" | "detail" }>({ theme: null, route: "list" });
  const scrolls = useRef<Record<string, number>>({});
  const pushed = useRef(0);
  const byFlood = useRef(false);
  const worldRef = useLibraryWorld(pageRef, headRef, riverRef, startRef);
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

  // The head sticks right under the app's top bar (the shell's sticky header).
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

  const { cards, fields, byId } = useMemo(() => {
    const fieldMap = new Map<string, Field>();
    for (const d of domains) {
      if (!d.parent_id) fieldMap.set(d.id, { id: d.id, name: d.name, color: asDomainColor(d.color), count: 0, branches: [] });
    }
    for (const d of domains) if (d.parent_id) fieldMap.get(d.parent_id)?.branches.push(d);
    const none: Field = { id: NONE, name: "Tanpa domain", color: "domain-none", count: 0, branches: [] };
    fieldMap.set(NONE, none);
    const subjectById = new Map(subjects.map((s) => [s.id, s]));
    const topicById = new Map(topics.map((t) => [t.id, t]));
    const noteById = new Map(notes.map((n) => [n.id, n]));
    const list: TermCard[] = terms.map((t) => {
      const own = t.domain_id ? domainIdx.get(t.domain_id) : undefined;
      const field = fieldMap.get(own ? (own.parent_id ?? own.id) : NONE) ?? none;
      // Every domain's field counts the term once (one term, many domains).
      const all = termDomainIds(t)
        .map((id) => domainIdx.get(id))
        .filter((d): d is VocabDomain => Boolean(d));
      const fieldIds = [...new Set([field.id, ...all.map((d) => d.parent_id ?? d.id)])].filter((id) => fieldMap.has(id));
      for (const id of fieldIds) (fieldMap.get(id) as Field).count += 1;
      const path = t.domain_id ? domainPath(t.domain_id, domainIdx) || "Tanpa domain" : "Tanpa domain";
      const others = all.filter((d) => d.id !== t.domain_id).map((d) => ({ path: domainPath(d.id, domainIdx), color: colorOfDomain(d, domainIdx) }));
      const week = weekNumberFor(programStart, t.learned_on);
      const subject = t.subject_id ? subjectById.get(t.subject_id) : undefined;
      const topic = t.syllabus_item_id ? topicById.get(t.syllabus_item_id) : undefined;
      const note = t.note_id ? noteById.get(t.note_id) : undefined;
      return {
        id: t.id,
        term: t.term,
        meta: `${path} · W${week}`,
        color: field.color,
        definition: t.definition.trim() ? excerpt(t.definition, 360) : "",
        field: field.id,
        branch: own?.parent_id ? own.id : null,
        fields: fieldIds,
        branches: all.filter((d) => d.parent_id).map((d) => d.id),
        hay: normalizeSearch(`${t.term} ${t.aliases.join(" ")} ${t.definition.slice(0, 5000)}`),
        page: {
          id: t.id,
          term: t.term,
          aliases: t.aliases,
          definition: t.definition,
          learnedOn: t.learned_on,
          week,
          path,
          others,
          color: field.color,
          fieldId: field.id,
          status: !t.embedded_at && t.domain_source === "pending" ? "unprocessed" : t.domain_source === "pending" ? "pending" : null,
          subject: subject ? { id: subject.id, title: subject.title } : null,
          topic: topic ? { id: topic.id, title: topic.title } : null,
          note: note ? { id: note.id, title: note.title } : null,
        },
      };
    });
    const sorted = [...fieldMap.values()]
      .filter((x) => x.id !== NONE || x.count > 0)
      .sort((a, b) => (a.id === NONE ? 1 : b.id === NONE ? -1 : b.count - a.count || a.name.localeCompare(b.name, "id")));
    return { cards: list, fields: sorted, byId: new Map(list.map((c) => [c.id, c])) };
  }, [terms, domains, domainIdx, programStart, subjects, topics, notes]);

  const fieldOf = useCallback((id: string | null) => (id ? (fields.find((x) => x.id === id) ?? null) : null), [fields]);
  const colorOf = useCallback(
    (domainId: string | null): DomainColor => {
      const own = domainId ? domainIdx.get(domainId) : undefined;
      const top = own?.parent_id ? domainIdx.get(own.parent_id) : own;
      return asDomainColor(top?.color);
    },
    [domainIdx],
  );

  const field = fieldOf(shown.field);
  const termCard = shown.term ? (byId.get(shown.term) ?? null) : null;
  const themeField = termCard ? fieldOf(termCard.field) : field;
  useEffect(() => {
    startRef.current = { theme: themeField ? `var(--${themeField.color})` : null, route: termCard ? "detail" : "list" };
  }, [themeField, termCard]);

  const words = normalizeSearch(f.q ?? "").split(/\s+/).filter(Boolean);
  const matches = (c: TermCard) => words.every((w) => c.hay.includes(w));
  const branchOk = (c: TermCard) =>
    !f.domain || (f.domain === "umum" ? c.branch === null && c.branches.length === 0 : c.branches.includes(f.domain));
  // Searching is Istilah Teknis' (its shelf, a room); the books level has no search.
  const inTerms = shown.book === "istilah";
  const searching = inTerms && words.length > 0;
  const listed = field ? cards.filter((c) => c.fields.includes(field.id) && branchOk(c) && matches(c)) : searching ? cards.filter(matches) : [];

  // The term after this one, in the order the reader came through (the room, the search, else the term's field).
  const sequence = termCard ? (listed.some((c) => c.id === termCard.id) ? listed : cards.filter((c) => c.fields.includes(termCard.field))) : [];
  const nextCard = termCard && sequence.length > 1 ? sequence[(sequence.findIndex((c) => c.id === termCard.id) + 1) % sequence.length] : null;

  // ------------------------------------------------------------ transitions
  const play = useCallback(
    (kind: "open" | "close", colour: string, swapView: () => void) => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return swapView();
      // The DOM head and controls leave with the scene and come back with the new view (.library-page[data-transition]).
      const page = pageRef.current;
      const mark = (phase: "out" | "in" | null) => {
        if (!page) return;
        if (phase) page.dataset.transition = `${kind}-${phase}`;
        else delete page.dataset.transition;
      };
      const swap = () => {
        swapView();
        mark("in");
      };
      mark("out");
      if (worldRef.current) {
        void worldRef.current.transition(kind, colour, swap).then(() => mark(null));
        return;
      }
      // Without the world: a plain wash slides across, the page swaps under it, then it fades.
      const wash = washRef.current;
      if (!wash) {
        swap();
        return mark(null);
      }
      wash.style.background = `color-mix(in srgb, ${colour} 45%, var(--bg))`;
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
    [worldRef],
  );

  // The URL leads; the shown view follows it through a transition.
  useEffect(() => {
    if (wanted.book === shown.book && wanted.field === shown.field && wanted.term === shown.term) return;
    const keyOf = (v: View) => `${v.book ?? ""}/${v.field ?? ""}/${v.term ?? ""}`;
    const from = keyOf(shown);
    const target: View = { book: wanted.book, field: wanted.field, term: wanted.term };
    const targetTerm = target.term ? byId.get(target.term) : null;
    const nextTheme = targetTerm ? fieldOf(targetTerm.field) : fieldOf(target.field);

    // Into the Bahasa book: the atlas opens over the shelf, which stays until the fog covers it (onCovered).
    if (target.book === "bahasa" && shown.book !== "bahasa") {
      scrolls.current[from] = window.scrollY;
      return;
    }
    // Out of it: the shelf comes back under the fog, and the book closes onto its sheet.
    if (shown.book === "bahasa" && target.book !== "bahasa") {
      const toShelf = !target.book;
      const back = scrolls.current[keyOf(target)];
      const id = requestAnimationFrame(() => {
        setShown(target);
        worldRef.current?.setTheme(nextTheme ? `var(--${nextTheme.color})` : null);
        worldRef.current?.setRoute(target.term ? "detail" : "list");
        requestAnimationFrame(() => window.scrollTo({ top: back ?? 0, behavior: "instant" }));
        setClosing({
          to: () => (toShelf ? sheetRect("buku-bahasa") : null),
          done: () => {
            setLifted(false);
            setClosing(null);
          },
        });
      });
      return () => cancelAnimationFrame(id);
    }

    const swap = () => {
      scrolls.current[from] = window.scrollY;
      setShown(target);
      worldRef.current?.setTheme(nextTheme ? `var(--${nextTheme.color})` : null);
      worldRef.current?.setRoute(target.term ? "detail" : "list");
      const back = scrolls.current[keyOf(target)];
      requestAnimationFrame(() => window.scrollTo({ top: target.term ? 0 : (back ?? 0), behavior: "instant" }));
    };

    // Arriving through the next-term flood: the screen is already covered; swap, then let the flood go.
    if (byFlood.current) {
      byFlood.current = false;
      swap();
      const dome = domeRef.current;
      if (dome) {
        dome
          .animate([{ opacity: 1 }, { opacity: 0 }], { duration: 520, delay: 160, easing: "ease-out", fill: "forwards" })
          .finished.then(() => {
            dome.hidden = true;
            dome.getAnimations().forEach((a) => a.cancel());
            dome.style.transform = "translateY(100%)";
          })
          .catch(() => undefined);
      }
      return;
    }

    const deeper = depthOf(target) > depthOf(shown) || Boolean(target.term && shown.term);
    // Between the books and a book, the wash takes the book's colour; deeper in, the field's.
    const bookLevel = Math.min(depthOf(target), depthOf(shown)) === 0;
    const book = target.book ?? shown.book;
    const colourField = deeper ? (nextTheme ?? fieldOf(shown.field)) : (fieldOf(shown.term ? (byId.get(shown.term)?.field ?? null) : shown.field) ?? nextTheme);
    const colour = bookLevel && book ? BOOK_COLOR[book] : (colourField?.color ?? "domain-none");
    play(deeper ? "open" : "close", `var(--${colour})`, swap);
  }, [wanted.book, wanted.field, wanted.term, shown, byId, fieldOf, play, worldRef]);

  // ------------------------------------------------------------ navigation
  const go = (view: View, opts: { push?: boolean } = { push: true }) => {
    const url = new URL(window.location.href);
    for (const key of ["buku", "bidang", "istilah"] as const) url.searchParams.delete(key);
    if (view.book) url.searchParams.set("buku", view.book);
    if (view.field) url.searchParams.set("bidang", view.field);
    if (view.term) url.searchParams.set("istilah", view.term);
    if (!view.term) {
      url.searchParams.delete("q");
      url.searchParams.delete("domain");
    }
    if (opts.push) {
      pushed.current += 1;
      window.history.pushState(null, "", url);
    } else window.history.replaceState(null, "", url);
    if (!view.term) update({ q: undefined, domain: undefined });
  };
  const follow = (view: View) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    go(view);
  };
  const back = () => {
    if (pushed.current > 0) {
      pushed.current -= 1;
      window.history.back();
      return;
    }
    // Arrived straight on a term, a room or a book: step up one level.
    if (shown.term) go({ book: "istilah", field: shown.field, term: null });
    else if (shown.field) go({ book: "istilah", field: null, term: null });
    else go({ book: null, field: null, term: null });
  };
  const openTerm = (id: string) => (byId.has(id) ? follow({ book: "istilah", field: shown.field, term: id }) : null);
  const commitNext = () => {
    if (!nextCard) return;
    byFlood.current = true;
    const url = new URL(window.location.href);
    url.searchParams.set("istilah", nextCard.id);
    window.history.replaceState(null, "", url);
  };

  // ------------------------------------------------------------ view
  const fieldCard = (x: Field): LibraryCardData => ({
    id: x.id,
    term: x.name,
    meta: `${x.count} istilah${x.branches.length ? ` · ${x.branches.length} cabang` : ""}`,
    color: x.color,
    definition: x.branches.length ? x.branches.map((b) => b.name).join(", ") : "Belum ada cabang.",
  });
  const fieldCount = fields.filter((x) => x.id !== NONE).length;
  const bookCards: { book: Book; card: LibraryCardData }[] = [
    {
      book: "istilah",
      card: {
        id: "buku-istilah",
        term: "Istilah Teknis",
        meta: `${cards.length} istilah · ${fieldCount} bidang`,
        color: BOOK_COLOR.istilah,
        definition: fieldCount ? fields.filter((x) => x.id !== NONE).map((x) => x.name).join(", ") : "Belum ada bidang.",
      },
    },
    {
      book: "bahasa",
      card: {
        id: "buku-bahasa",
        term: "Bahasa",
        meta: `${languages.words.length} diksi · ${languages.languages.length} bahasa`,
        color: BOOK_COLOR.bahasa,
        definition: languages.languages.length ? languages.languages.map((l) => l.name).join(", ") : "Belum ada bahasa.",
      },
    },
  ];
  const openBook = (book: Book) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (book === "istilah") return follow({ book, field: null, term: null })(event);
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    // The sheet lifts off the shelf: the atlas's book starts on its rect, and the world stops drawing it.
    setLiftedFrom(event.currentTarget.getBoundingClientRect());
    go({ book: "bahasa", field: null, term: null });
  };
  const pickCountry = useCallback((code: string | null) => {
    const url = new URL(window.location.href);
    if (code) url.searchParams.set("negara", code);
    else url.searchParams.delete("negara");
    window.history.replaceState(null, "", url);
  }, []);
  const exitBook = useCallback(() => {
    if (pushed.current > 0) {
      pushed.current -= 1;
      window.history.back();
      return;
    }
    const url = new URL(window.location.href);
    for (const key of ["buku", "negara"]) url.searchParams.delete(key);
    window.history.pushState(null, "", url);
  }, []);
  const onCovered = useCallback(
    (covered: boolean) => {
      worldRef.current?.setPaused(covered);
      // Under full cover the shelf gives way to the atlas.
      if (covered) setShown((v) => (v.book === "bahasa" ? v : { book: "bahasa", field: null, term: null }));
    },
    [worldRef],
  );
  const onLifted = useCallback(() => setLifted(true), []);

  // On the books shelf, warm the atlas (its shapes and the hologram) for a book opened without warning.
  useEffect(() => {
    if (shown.book) return;
    const idle = typeof window.requestIdleCallback === "function";
    const id = idle ? window.requestIdleCallback(preloadAtlas, { timeout: 3000 }) : window.setTimeout(preloadAtlas, 1500);
    return () => (idle ? window.cancelIdleCallback(id) : window.clearTimeout(id));
  }, [shown.book]);
  const branchOptions: FilterOption[] = field
    ? [
        { key: null, label: "Semua cabang", count: field.count },
        ...field.branches.map((b) => ({ key: b.id, label: b.name, count: cards.filter((c) => c.branch === b.id).length })),
        ...(field.id !== NONE
          ? [{ key: "umum", label: `Langsung di ${field.name}`, count: cards.filter((c) => c.field === field.id && c.branch === null).length }]
          : []),
      ]
    : [];
  const filtering = inTerms && Boolean(f.q || f.domain);
  const onTermPage = Boolean(termCard);
  const showingBooks = !shown.book;
  const inAtlas = shown.book === "bahasa";
  const showingFields = inTerms && !field && !onTermPage && words.length === 0;
  const backLabel = field ? field.name : words.length > 0 ? "Hasil pencarian" : "Istilah Teknis";
  const level = onTermPage ? "term" : field ? "room" : showingBooks ? "books" : "shelf";

  return (
    <div ref={pageRef} className="library-page" data-library-page data-room={field ? field.id : undefined} data-view={level}>
      <div ref={headRef} className="library-head" data-library-head hidden={onTermPage || inAtlas}>
        {!showingBooks && (
          <div className="flex justify-center">
            <button type="button" onClick={back} className="btn btn-ghost btn-sm -mb-1">
              {field ? "← Semua bidang" : "← Semua buku"}
            </button>
          </div>
        )}
        <h1 className="display text-center text-[clamp(2.5rem,1.6rem+4vw,4.5rem)] text-balance">
          {field ? field.name : showingBooks ? "Perpustakaan" : "Istilah Teknis"}
        </h1>
        <p className="mt-1 text-center text-sm text-muted">
          {field
            ? `${field.count} istilah${field.branches.length ? ` · ${field.branches.length} cabang` : ""}`
            : showingBooks
              ? "Pilih buku untuk membukanya."
              : "Pilih bidang untuk masuk ke ruangnya, atau cari istilah di semua bidang."}
        </p>
        {inTerms && (
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
        )}
        {filtering && (
          <p className="mt-3 flex items-center justify-center gap-3 text-sm text-muted" aria-live="polite">
            {listed.length} istilah ditemukan
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

      {termCard && (
        <LibraryTerm key={termCard.id} term={termCard.page} backLabel={backLabel} onBack={back} openTerm={openTerm} colorOf={colorOf}>
          {nextCard && (
            <NextThreshold next={{ id: nextCard.id, term: nextCard.term, path: nextCard.page.path, color: nextCard.color }} domeRef={domeRef} onCommit={commitNext} />
          )}
        </LibraryTerm>
      )}

      {inTerms &&
        !onTermPage &&
        (terms.length === 0 ? (
          <EmptyState
            title="Rak masih kosong"
            description="Tambahkan istilah di Istilah Teknis › Daftar; setiap istilah menjadi satu lembar di sini."
          />
        ) : (
          !showingFields &&
          listed.length === 0 && (
            <EmptyState title="Tidak ada istilah yang cocok" description="Coba kata kunci lain atau hapus filter." />
          )
        ))}

      {/* Always mounted, even when empty: the world watches this list. */}
      <ul
        ref={riverRef}
        className="library-river"
        data-library-river
        aria-label={showingBooks ? "Buku" : showingFields ? "Bidang" : "Lembar istilah"}
      >
        {onTermPage
          ? null
          : showingBooks
            ? bookCards.map(({ book, card }) => (
                <LibraryCard
                  key={card.id}
                  kind="book"
                  card={card}
                  href={`?buku=${book}`}
                  onOpen={openBook(book)}
                  onIntent={book === "bahasa" ? preloadAtlas : undefined}
                  lifted={book === "bahasa" && lifted}
                />
              ))
            : showingFields
              ? fields.map((x) => (
                  <LibraryCard key={x.id} kind="field" card={fieldCard(x)} href={`?buku=istilah&bidang=${x.id}`} onOpen={follow({ book: "istilah", field: x.id, term: null })} />
                ))
              : listed.map((card) => (
                  <LibraryCard
                    key={card.id}
                    kind="term"
                    card={card}
                    href={`?buku=istilah&${field ? `bidang=${field.id}&` : ""}istilah=${card.id}`}
                    onOpen={follow({ book: "istilah", field: shown.field, term: card.id })}
                  />
                ))}
      </ul>

      {!onTermPage && (showingBooks || (showingFields ? fields.length > 0 : listed.length > 0)) && (
        <footer className="library-end" data-library-end>
          <p className="eyebrow justify-center">
            {field ? `Ujung ${field.name}` : showingBooks ? "Ujung perpustakaan" : showingFields ? "Ujung rak" : "Ujung pencarian"}
          </p>
          <h2 className="display mt-3 text-[clamp(1.75rem,1.2rem+2.4vw,2.75rem)] text-balance">
            {field
              ? `Kamu sudah sampai ujung ${field.name}`
              : showingBooks
                ? "Itu semua bukumu"
                : showingFields
                  ? "Itu semua bidangmu"
                  : "Itu semua yang cocok"}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {field
              ? filtering
                ? `${listed.length} dari ${field.count} istilah cocok dengan filtermu.`
                : `${field.count} istilah, dari yang terbaru sampai yang pertama.`
              : showingBooks
                ? `${cards.length} istilah teknis dan ${languages.words.length} diksi bahasa.`
                : showingFields
                  ? `${fields.length} bidang, ${cards.length} istilah.`
                  : `${listed.length} dari ${cards.length} istilah.`}
          </p>
          {showingBooks ? (
            <Link href="/" className="btn btn-primary mt-6">
              Kembali ke dashboard
            </Link>
          ) : (
            <button type="button" onClick={back} className="btn btn-primary mt-6">
              {field ? "← Kembali ke semua bidang" : "← Kembali ke semua buku"}
            </button>
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

      {(atlasOpen || closing) && (
        <LanguageAtlas
          languages={languages.languages}
          words={languages.words}
          programStart={programStart}
          country={atlasOpen ? country : null}
          onCountry={pickCountry}
          onExit={exitBook}
          from={liftedFrom}
          closing={closing}
          coverMeta={bookCards[1].card.meta}
          onCovered={onCovered}
          onLifted={onLifted}
        />
      )}

      {/* The wash for the transitions when the world isn't running, and the next-term dome. */}
      <div ref={washRef} className="library-wash" aria-hidden="true" hidden />
      <div ref={domeRef} className="library-dome" aria-hidden="true" hidden />
    </div>
  );
}
