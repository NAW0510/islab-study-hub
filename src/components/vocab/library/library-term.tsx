"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { ArrowLeft, BookOpen, NotebookPen, Pencil, Target } from "lucide-react";
import { nearestTerms, type NearestTerm } from "@/lib/actions/vocab";
import { callAction } from "@/lib/call-action";
import { cn, formatDate } from "@/lib/utils";
import type { DomainColor } from "@/lib/vocab/seed-domains";
import { DOMAIN_TONE_CLASS } from "@/lib/vocab/seed-domains";
import { CoverArt } from "./cover-art";

// The Markdown renderer (react-markdown + KaTeX) is heavy: only a term page loads it.
const Markdown = dynamic(() => import("../../markdown").then((m) => m.Markdown), {
  loading: () => <p className="text-muted">Memuat definisi…</p>,
});

export type TermPageData = {
  id: string;
  term: string;
  aliases: string[];
  definition: string;
  learnedOn: string;
  week: number;
  path: string;
  color: DomainColor;
  fieldId: string;
  status: "pending" | "unprocessed" | null;
  subject: { id: string; title: string } | null;
  topic: { id: string; title: string } | null;
  note: { id: string; title: string } | null;
};

/**
 * A term's page inside the Perpustakaan, after the Articles page of
 * labmgm.org: a hero whose letters rise out of their words, the term's cover
 * (drawn by the world as a sheet of water when it runs), the definition with
 * its formulas, the nearest terms in meaning and the term's links. Blocks
 * come in as they scroll into view; nothing moves with reduced motion. The
 * pull to the next term lives at the end (next-threshold.tsx).
 */
export function LibraryTerm({
  term,
  backLabel,
  onBack,
  openTerm,
  colorOf,
  children,
}: {
  term: TermPageData;
  backLabel: string;
  onBack: () => void;
  /** Opens another term in place (with its transition); null when that term isn't on this page. */
  openTerm: (id: string) => ((event: MouseEvent<HTMLAnchorElement>) => void) | null;
  colorOf: (domainId: string | null) => DomainColor;
  children?: ReactNode;
}) {
  const root = useRef<HTMLElement>(null);
  const [near, setNear] = useState<NearestTerm[] | null>(null);

  useEffect(() => {
    let alive = true;
    void callAction(() => nearestTerms(term.id)).then((r) => {
      if (alive) setNear(r && "terms" in r ? r.terms : []);
    });
    return () => {
      alive = false;
    };
  }, [term.id]);

  // Blocks reveal as they come into view (already-passed ones show at once).
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting || entry.boundingClientRect.top < 0) {
            entry.target.setAttribute("data-revealed", "");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    const watch = () => el.querySelectorAll("[data-reveal]:not([data-revealed]), .markdown > *:not([data-revealed])").forEach((b) => observer.observe(b));
    watch();
    // The definition arrives a moment later (dynamic import): watch its blocks too.
    const mutations = new MutationObserver(watch);
    mutations.observe(el, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, [term.id]);

  let letter = 0;
  const words = term.term.split(/(\s+)/);

  return (
    <article ref={root} className="library-detail" data-library-detail>
      <div className="library-detail-back">
        <button type="button" onClick={onBack} className="btn btn-ghost btn-sm">
          <ArrowLeft className="size-4" aria-hidden="true" /> {backLabel}
        </button>
      </div>

      <header className="library-detail-hero">
        <p className="eyebrow justify-center">
          <span className="font-display tracking-[0.08em] text-text tabular-nums">W{term.week}</span>
          <span className="eyebrow-rule" />
          {formatDate(term.learnedOn)}
        </p>
        <h1 className="library-detail-title display">
          <span className="sr-only">{term.term}</span>
          <span aria-hidden="true">
            {words.map((word, w) =>
              /^\s+$/.test(word) ? (
                <span key={w}> </span>
              ) : (
                <span key={w} className="library-word">
                  {[...word].map((ch, i) => (
                    <span key={i} className="library-letter" style={{ "--i": letter++ } as React.CSSProperties}>
                      {ch}
                    </span>
                  ))}
                </span>
              ),
            )}
          </span>
        </h1>
        {term.aliases.length > 0 && <p className="library-detail-aliases">Juga disebut {term.aliases.join(", ")}</p>}
        <div className="library-detail-chips">
          <span className={cn("chip chip-tone", DOMAIN_TONE_CLASS[term.color])}>{term.path}</span>
          {term.status === "pending" && <span className="chip chip-tone tone-none">Menunggu domain</span>}
          {term.status === "unprocessed" && <span className="chip chip-tone tone-warn">Belum diproses</span>}
        </div>
      </header>

      <figure className="library-detail-cover" data-library-cover data-cover-id={term.id} data-color={term.color}>
        <CoverArt seed={term.id} color={term.color} />
        <span className="library-detail-cover-veil" aria-hidden="true" />
      </figure>

      <section className="library-detail-body" aria-label="Definisi">
        {term.definition.trim() ? (
          <Markdown content={term.definition} />
        ) : (
          <p className="text-muted" data-reveal>
            Belum ada definisi.{" "}
            <Link href={`/vocab?term=${term.id}`} className="text-accent hover:text-accent-hover">
              Tulis dengan katamu sendiri
            </Link>
          </p>
        )}
      </section>

      <section className="library-detail-section" data-reveal aria-labelledby="istilah-terdekat">
        <h2 id="istilah-terdekat" className="eyebrow">
          Istilah terdekat
        </h2>
        {near === null ? (
          <p className="text-sm text-muted">Mencari istilah yang maknanya dekat…</p>
        ) : near.length === 0 ? (
          <p className="text-sm text-muted">Belum ada; istilah ini mungkin belum diproses.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {near.map((n) => {
              const open = openTerm(n.id);
              return (
                <li key={n.id}>
                  <a
                    href={open ? `?istilah=${n.id}` : `/vocab?term=${n.id}`}
                    onClick={open ?? undefined}
                    className={cn("chip chip-tone min-h-9 hover:opacity-80 pointer-coarse:min-h-11", DOMAIN_TONE_CLASS[colorOf(n.domain_id)])}
                    title={`Kemiripan ${Math.round(n.similarity * 100)}%`}
                  >
                    {n.term}
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {(term.subject || term.topic || term.note) && (
        <section className="library-detail-section" data-reveal aria-labelledby="kaitan">
          <h2 id="kaitan" className="eyebrow">
            Kaitan
          </h2>
          <ul className="flex flex-col gap-1 text-sm">
            {term.subject && (
              <li>
                <Link href={`/subjects/${term.subject.id}`} className="inline-flex min-h-9 items-center gap-2 hover:text-accent">
                  <BookOpen className="size-4 text-muted" aria-hidden="true" /> {term.subject.title}
                </Link>
              </li>
            )}
            {term.topic && (
              <li>
                <Link href={`/vocab?topic=${term.topic.id}`} className="inline-flex min-h-9 items-center gap-2 hover:text-accent">
                  <Target className="size-4 text-muted" aria-hidden="true" /> {term.topic.title}
                </Link>
              </li>
            )}
            {term.note && (
              <li>
                <Link href={`/notes/${term.note.id}`} className="inline-flex min-h-9 items-center gap-2 hover:text-accent">
                  <NotebookPen className="size-4 text-muted" aria-hidden="true" /> {term.note.title}
                </Link>
              </li>
            )}
          </ul>
        </section>
      )}

      <div className="library-detail-actions" data-reveal>
        <Link href={`/vocab?term=${term.id}`} className="btn btn-secondary">
          <Pencil className="size-4" aria-hidden="true" /> Edit di Daftar
        </Link>
      </div>

      {children}
    </article>
  );
}
