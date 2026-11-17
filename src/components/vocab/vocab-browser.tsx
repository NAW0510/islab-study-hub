"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useTransition } from "react";
import { BookA, Loader2, RefreshCw, Search, X } from "lucide-react";
import { deleteTerm, restoreTerm, retryPending, type SaveTermResult } from "@/lib/actions/vocab";
import { callAction } from "@/lib/call-action";
import { currentWeekInfo, weekNumberFor } from "@/lib/report-template";
import type { SubjectRef, TopicRef, VocabDomain, VocabTerm } from "@/lib/types";
import { useUrlFilters } from "@/lib/use-url-filters";
import { cn, excerpt, normalizeSearch, todayISO } from "@/lib/utils";
import { domainIndex, suggestionsFor } from "@/lib/vocab/format";
import { EmptyState, PageHeader } from "../ui";
import { useToast } from "../toast";
import { BulkAdd } from "./bulk-add";
import { DetailDrawer } from "./detail-drawer";
import { QuickAdd } from "./quick-add";
import { VocabTabs } from "./vocab-tabs";
import { TermRowStatus } from "./term-row-status";

/**
 * Everything in the query string: search and filters, plus `term` (the term
 * open in the drawer, so other pages can link straight to it) and `topic`
 * (terms of one syllabus topic, linked from the syllabus).
 */
type Filters = { q?: string; domain?: string; status?: string; topic?: string; sort?: string; term?: string };

export function VocabBrowser({
  terms,
  domains,
  subjects,
  topics,
  programStart,
  initial,
}: {
  terms: VocabTerm[];
  domains: VocabDomain[];
  subjects: SubjectRef[];
  topics: TopicRef[];
  programStart: string;
  initial: Filters;
}) {
  const router = useRouter();
  const toast = useToast();
  const { filters: f, update } = useUrlFilters(initial);
  const selectedId = f.term ?? null;
  const setSelectedId = (id: string | null) => update({ term: id ?? undefined });
  /** Clears search and filters; the sort order stays. */
  const reset = () => update({ q: undefined, domain: undefined, status: undefined, topic: undefined });
  const [, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);

  const domainIdx = useMemo(() => domainIndex(domains), [domains]);
  const existing = useMemo(() => {
    const map = new Map<string, VocabTerm>();
    for (const t of terms) {
      map.set(t.term.toLowerCase(), t);
      for (const a of t.aliases) map.set(a.toLowerCase(), t);
    }
    return map;
  }, [terms]);

  // "/" focuses the search box, unless the user is already typing somewhere.
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

  const needReview = terms.filter((t) => t.domain_source === "pending" && t.embedded_at).length;
  const unprocessed = terms.filter((t) => !t.embedded_at).length;

  const terms_ = useMemo(() => {
    const searched = normalizeSearch(f.q ?? "");
    const words = searched.split(/\s+/).filter(Boolean);
    let list = terms.filter((t) => {
      if (f.domain === "none" && t.domain_id !== null) return false;
      if (f.domain && f.domain !== "none") {
        const d = t.domain_id ? domainIdx.get(t.domain_id) : null;
        if (!d || (d.id !== f.domain && d.parent_id !== f.domain)) return false;
      }
      if (f.status === "tinjau" && !(t.domain_source === "pending" && t.embedded_at)) return false;
      if (f.status === "belum" && t.embedded_at) return false;
      if (f.topic && t.syllabus_item_id !== f.topic) return false;
      if (words.length > 0) {
        const hay = normalizeSearch(`${t.term} ${t.aliases.join(" ")} ${t.definition.slice(0, 5000)}`);
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    if (f.sort === "abjad") list = [...list].sort((a, b) => a.term.localeCompare(b.term, "id"));
    return list;
  }, [terms, f, domainIdx]);

  const fields = domains.filter((d) => !d.parent_id);
  const countFor = (fieldId: string) =>
    terms.filter((t) => {
      const d = t.domain_id ? domainIdx.get(t.domain_id) : null;
      return d && (d.id === fieldId || d.parent_id === fieldId);
    }).length;

  const { week } = currentWeekInfo(programStart, todayISO());
  const newThisWeek = terms.filter((t) => weekNumberFor(programStart, t.learned_on) === week).length;
  const activeDomains = new Set(terms.map((t) => t.domain_id).filter(Boolean)).size;

  const refresh = () => router.refresh();

  function removeTerm(term: VocabTerm) {
    setSelectedId(null);
    startTransition(async () => {
      const result = await callAction(() => deleteTerm(term.id));
      if (result?.error) {
        toast({ message: result.error });
        return;
      }
      refresh();
      toast({
        message: `“${term.term}” dihapus.`,
        actionLabel: "Urungkan",
        onAction: () =>
          startTransition(async () => {
            const r = await callAction(() => restoreTerm(term.id));
            toast({ message: r?.error ? r.error : "Istilah dikembalikan." });
            refresh();
          }),
      });
    });
  }

  function onSaved(result: Extract<SaveTermResult, { term: VocabTerm }>) {
    refresh();
    if (result.embed === "failed") {
      toast({ message: "Istilah disimpan, tapi klasifikasi tertunda. Coba proses lagi nanti." });
    } else if (result.term.domain_source === "pending") {
      toast({ message: "Istilah disimpan. Sistem ragu — pilih domainnya di daftar." });
    } else {
      const d = result.term.domain_id ? domainIdx.get(result.term.domain_id) : null;
      toast({ message: `Istilah disimpan${d ? ` → ${d.name}` : ""}.` });
    }
  }

  const selected = selectedId ? (terms.find((t) => t.id === selectedId) ?? null) : null;

  return (
    <>
      <PageHeader
        title="Kosakata"
        description={`${terms.length} istilah · ${activeDomains} cabang ilmu terpakai · ${newThisWeek} baru minggu ini`}
        actions={<BulkAdd existing={[...existing.keys()]} onSaved={refresh} />}
      />
      <VocabTabs active="list" />

      <div className="mb-6">
        <QuickAdd domains={domains} subjects={subjects} topics={topics} existing={existing} onSaved={onSaved} />
      </div>

      {(needReview > 0 || unprocessed > 0) && (
        <div className="card mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-accent/30 bg-accent-soft/40 px-4 py-3 text-sm">
          <span className="font-medium">
            {needReview > 0 && `${needReview} istilah menunggu domain`}
            {needReview > 0 && unprocessed > 0 && " · "}
            {unprocessed > 0 && `${unprocessed} belum diproses`}
          </span>
          <span className="ml-auto flex gap-2">
            {needReview > 0 && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => update({ status: "tinjau" })}>
                Tinjau
              </button>
            )}
            {unprocessed > 0 && <RetryButton onDone={refresh} />}
          </span>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2" role="search">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input
            ref={searchRef}
            type="search"
            value={f.q ?? ""}
            onChange={(e) => update({ q: e.target.value || undefined })}
            placeholder="Cari istilah, alias, definisi…  ( / )"
            className="input pl-9"
            aria-label="Cari istilah"
          />
        </div>
        <select
          aria-label="Urutkan"
          value={f.sort ?? "baru"}
          onChange={(e) => update({ sort: e.target.value === "baru" ? undefined : e.target.value })}
          className="input w-auto"
        >
          <option value="baru">Terbaru dulu</option>
          <option value="abjad">Abjad</option>
        </select>
      </div>

      <div className="no-scrollbar mb-6 flex gap-1.5 overflow-x-auto" role="group" aria-label="Filter domain">
        <FilterChip active={!f.domain && !f.status && !f.topic} onClick={reset}>
          Semua <span className="opacity-60">{terms.length}</span>
        </FilterChip>
        {fields.map((d) => (
          <FilterChip key={d.id} active={f.domain === d.id} onClick={() => update({ domain: f.domain === d.id ? undefined : d.id, status: undefined })}>
            {d.name} <span className="opacity-60">{countFor(d.id)}</span>
          </FilterChip>
        ))}
        <FilterChip active={f.domain === "none"} onClick={() => update({ domain: f.domain === "none" ? undefined : "none", status: undefined })}>
          Tanpa domain <span className="opacity-60">{terms.filter((t) => !t.domain_id).length}</span>
        </FilterChip>
      </div>

      {(f.q || f.domain || f.status || f.topic) && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted">
          <span>{terms_.length} istilah ditemukan</span>
          {f.topic && (
            <span className="chip bg-surface-2 text-text">
              Topik: {topics.find((t) => t.id === f.topic)?.title ?? "tidak ditemukan"}
            </span>
          )}
          <button type="button" onClick={reset} className="inline-flex items-center gap-1 text-accent hover:text-accent-hover">
            <X className="size-3.5" /> Hapus filter
          </button>
        </div>
      )}

      {terms_.length === 0 ? (
        <EmptyState
          icon={BookA}
          title={terms.length === 0 ? "Belum ada istilah" : "Tidak ada istilah yang cocok"}
          description={
            terms.length === 0
              ? "Setiap istilah baru yang kamu temui minggu ini layak dicatat — sistem akan menebak bidangnya."
              : "Coba kata kunci lain atau hapus filter."
          }
        />
      ) : (
        <ul className="card divide-y divide-border">
          {terms_.map((t) => (
            <li key={t.id} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <button
                  type="button"
                  onClick={() => setSelectedId(t.id)}
                  className="font-display font-semibold tracking-tight hover:text-accent"
                >
                  {t.term}
                </button>
                {t.aliases.length > 0 && <span className="text-xs text-muted">({t.aliases.join(", ")})</span>}
                <span
                  className="ml-auto shrink-0 text-xs text-muted tabular-nums"
                  title={`Dipelajari ${t.learned_on}`}
                >
                  W{weekNumberFor(programStart, t.learned_on)}
                </span>
              </div>
              {t.definition.trim() && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{excerpt(t.definition, 180)}</p>}
              <div className="mt-1.5">
                <TermRowStatus
                  term={t}
                  domains={domainIdx}
                  suggestions={suggestionsFor(t, domainIdx)}
                  onOpen={() => setSelectedId(t.id)}
                  onDone={refresh}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <DetailDrawer
          key={selected.id}
          term={selected}
          domains={domainIdx}
          domainList={domains}
          subjects={subjects}
          topics={topics}
          programStart={programStart}
          onClose={() => setSelectedId(null)}
          onChanged={refresh}
          onDelete={removeTerm}
          onPickTerm={setSelectedId}
        />
      )}
    </>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "chip shrink-0 transition-colors",
        active ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted hover:text-text",
      )}
    >
      {children}
    </button>
  );
}

/** "Proses yang tertunda": retries everything that still has no embedding. */
export function RetryButton({ small = true, onDone }: { small?: boolean; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  return (
    <button
      type="button"
      disabled={pending}
      className={cn("btn btn-secondary", small && "btn-sm")}
      onClick={() =>
        startTransition(async () => {
          const r = await callAction(() => retryPending());
          if (r && "error" in r) toast({ message: r.error });
          else if (r.embed === "failed") toast({ message: "Masih gagal memproses. Periksa API key Voyage di Supabase." });
          else toast({ message: r.queued === 0 ? "Tidak ada yang tertunda." : `${r.queued} istilah diproses.` });
          onDone();
        })
      }
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
      Proses yang tertunda
    </button>
  );
}
