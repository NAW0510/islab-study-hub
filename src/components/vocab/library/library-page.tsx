"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { BookA, Search, X } from "lucide-react";
import { weekNumberFor } from "@/lib/report-template";
import type { VocabDomain, VocabTerm } from "@/lib/types";
import { useUrlFilters } from "@/lib/use-url-filters";
import { excerpt, normalizeSearch } from "@/lib/utils";
import { domainIndex, domainPath } from "@/lib/vocab/format";
import { asDomainColor } from "@/lib/vocab/seed-domains";
import { EmptyState } from "../../ui";
import { VocabTabs } from "../vocab-tabs";
import { FilterSheet, type FilterOption } from "./filter-sheet";
import { LibraryCard, type LibraryCardData } from "./library-card";
import { useLibraryWorld } from "./world-host";

type Filters = { q?: string; domain?: string };

/**
 * Kosakata › Perpustakaan: every term as a sheet of paper in a river, newest
 * first. This DOM page is complete on its own (links, focus, search, filter,
 * flip); the WebGL library world, when the device allows it, draws over it
 * (world-host.tsx) and never replaces it.
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
  const searchRef = useRef<HTMLInputElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const riverRef = useRef<HTMLUListElement>(null);
  useLibraryWorld(pageRef, headRef, riverRef);
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

  const cards = useMemo<(LibraryCardData & { field: string | null; hay: string })[]>(
    () =>
      terms.map((t) => {
        const own = t.domain_id ? domainIdx.get(t.domain_id) : undefined;
        const field = own?.parent_id ? (domainIdx.get(own.parent_id) ?? own) : own;
        return {
          id: t.id,
          term: t.term,
          domain: t.domain_id ? domainPath(t.domain_id, domainIdx) || "Tanpa domain" : "Tanpa domain",
          color: asDomainColor(field?.color),
          week: weekNumberFor(programStart, t.learned_on),
          definition: t.definition.trim() ? excerpt(t.definition, 360) : "",
          field: field?.id ?? null,
          hay: normalizeSearch(`${t.term} ${t.aliases.join(" ")} ${t.definition.slice(0, 5000)}`),
        };
      }),
    [terms, domainIdx, programStart],
  );

  const shown = useMemo(() => {
    const words = normalizeSearch(f.q ?? "").split(/\s+/).filter(Boolean);
    return cards.filter((c) => {
      if (f.domain === "none" && c.field !== null) return false;
      if (f.domain && f.domain !== "none" && c.field !== f.domain) return false;
      return words.every((w) => c.hay.includes(w));
    });
  }, [cards, f.q, f.domain]);

  const options: FilterOption[] = [
    { key: null, label: "Semua bidang", count: cards.length },
    ...domains
      .filter((d) => !d.parent_id)
      .map((d) => ({ key: d.id, label: d.name, count: cards.filter((c) => c.field === d.id).length })),
    { key: "none", label: "Tanpa domain", count: cards.filter((c) => c.field === null).length },
  ];

  const filtering = Boolean(f.q || f.domain);

  return (
    <div ref={pageRef} className="library-page" data-library-page>
      <VocabTabs active="library" />

      <div ref={headRef} className="library-head" data-library-head>
        <h1 className="display text-center text-[clamp(2.5rem,1.6rem+4vw,4.5rem)]">Perpustakaan</h1>
        <div className="mx-auto mt-4 flex w-full max-w-xl gap-2" role="search">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Cari istilah</span>
            <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              value={f.q ?? ""}
              onChange={(e) => update({ q: e.target.value || undefined })}
              placeholder="Cari istilah  ( / )"
              className="input h-11 rounded-btn pl-10"
            />
          </label>
          <FilterSheet options={options} active={f.domain ?? null} onPick={(key) => update({ domain: key ?? undefined })} />
        </div>
        {filtering && (
          <p className="mt-3 flex items-center justify-center gap-3 text-sm text-muted" aria-live="polite">
            {shown.length} istilah ditemukan
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
        shown.length === 0 && (
          <EmptyState icon={BookA} title="Tidak ada istilah yang cocok" description="Coba kata kunci lain atau hapus filter." />
        )
      )}
      {/* Always mounted, even when empty: the world watches this list. */}
      <ul ref={riverRef} className="library-river" data-library-river aria-label="Lembar istilah">
        {shown.map((card) => (
          <LibraryCard key={card.id} card={card} />
        ))}
      </ul>

      {shown.length > 0 && (
        <footer className="library-end" data-library-end>
          <p className="eyebrow justify-center">Ujung kosakata</p>
          <h2 className="display mt-3 text-[clamp(1.75rem,1.2rem+2.4vw,2.75rem)] text-balance">
            Kamu sudah sampai ujung kosakata
          </h2>
          <p className="mt-2 text-sm text-muted">
            {filtering
              ? `${shown.length} dari ${cards.length} istilah cocok dengan filtermu.`
              : `${cards.length} istilah, dari yang terbaru sampai yang pertama.`}
          </p>
          <Link href="/" className="btn btn-primary mt-6">
            Kembali ke dashboard
          </Link>
          <p className="mt-10 text-xs text-muted">
            Konsep perpustakaan terinspirasi halaman{" "}
            <a href="https://labmgm.org/articles" className="underline hover:text-text" target="_blank" rel="noreferrer">
              Articles MGM Laboratory
            </a>
            .
          </p>
        </footer>
      )}
    </div>
  );
}
