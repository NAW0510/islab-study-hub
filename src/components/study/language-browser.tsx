"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Search, Trash2, X } from "lucide-react";
import { createLanguage, createWord, deleteWord, restoreWord, updateWord } from "@/lib/actions/study";
import { callAction } from "@/lib/call-action";
import { weekNumberFor } from "@/lib/report-template";
import { COUNTRY_NAMES } from "@/lib/study/atlas/country-names";
import { LANGUAGE_PRESETS, type LanguagePreset } from "@/lib/study/languages";
import type { StudyLanguage, StudyWord } from "@/lib/types";
import { useUrlFilters } from "@/lib/use-url-filters";
import { normalizeSearch, todayISO } from "@/lib/utils";
import { ListItemMotion, ViewSwap } from "../motion";
import { NavSlot } from "../shell/nav-slot";
import { SlideGroup } from "../slide-group";
import { useToast } from "../toast";
import { EmptyState, PageHeader } from "../ui";
import { LanguageChip, LanguageManager, PresetGrid } from "./language-manager";
import { WordForm } from "./word-form";

type Filters = { bahasa?: string; q?: string };

/**
 * Ruang Studi › Bahasa: every diksi, by language. Add one at the top (the
 * same fields as the atlas's quick add), filter by language from the top
 * bar's second row, search, edit in a dialog, delete with "Urungkan".
 * "Kelola bahasa" holds the languages and their countries on the atlas.
 */
export function LanguageBrowser({
  languages,
  words,
  programStart,
  missing,
  initial,
}: {
  languages: StudyLanguage[];
  words: StudyWord[];
  programStart: string;
  missing: boolean;
  initial: Filters;
}) {
  const router = useRouter();
  const toast = useToast();
  const { filters: f, update } = useUrlFilters(initial);
  const [editing, setEditing] = useState<StudyWord | null>(null);
  const [, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);
  const byLanguage = useMemo(() => new Map(languages.map((l) => [l.id, l])), [languages]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of words) m.set(w.language_id, (m.get(w.language_id) ?? 0) + 1);
    return m;
  }, [words]);

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

  if (missing) {
    return (
      <>
        <PageHeader title="Bahasa" description="Diksi dari bahasa-bahasa yang kamu pelajari." />
        <EmptyState
          title="Tabel Bahasa belum ada di database ini"
          description="Migrasi study_languages belum diterapkan di database yang dipakai aplikasi. Setelah diterapkan, halaman ini langsung bisa dipakai."
        />
      </>
    );
  }

  if (languages.length === 0) return <FirstLanguage onAdded={() => router.refresh()} />;

  const active = f.bahasa && byLanguage.has(f.bahasa) ? f.bahasa : undefined;
  const thisWeek = weekNumberFor(programStart, todayISO());
  const newThisWeek = words.filter((w) => weekNumberFor(programStart, w.learned_on) === thisWeek).length;
  const terms = normalizeSearch(f.q ?? "").split(/\s+/).filter(Boolean);
  const shown = words.filter((w) => {
    if (active && w.language_id !== active) return false;
    if (terms.length === 0) return true;
    const hay = normalizeSearch(`${w.word} ${w.reading ?? ""} ${w.meaning} ${w.example ?? ""} ${w.notes ?? ""}`);
    return terms.every((t) => hay.includes(t));
  });

  const onSaved = (word: StudyWord) => {
    toast({ message: `“${word.word}” disimpan di ${byLanguage.get(word.language_id)?.name ?? "bahasanya"}.` });
    router.refresh();
  };
  const remove = (word: StudyWord) => {
    startTransition(async () => {
      const result = await callAction(() => deleteWord(word.id));
      if (result?.error) return toast({ message: result.error });
      router.refresh();
      toast({
        message: `“${word.word}” dihapus.`,
        actionLabel: "Urungkan",
        onAction: () => void callAction(() => restoreWord(word.id)).then(() => router.refresh()),
      });
    });
  };

  return (
    <>
      <PageHeader
        title="Bahasa"
        description={`${words.length} diksi · ${languages.length} bahasa · ${newThisWeek} baru minggu ini`}
        actions={<LanguageManager languages={languages} counts={counts} />}
      />

      {/* Which language: in the top bar's second row, after the Ruang Studi's parts. */}
      <NavSlot>
        <div role="group" aria-label="Pilih bahasa">
          <SlideGroup className="segmented segmented-sm">
            <button type="button" className="segmented-item" aria-pressed={!active} onClick={() => update({ bahasa: undefined })}>
              Semua <span className="opacity-60 tabular-nums">{words.length}</span>
            </button>
            {languages.map((l) => (
              <button key={l.id} type="button" className="segmented-item" aria-pressed={active === l.id} onClick={() => update({ bahasa: l.id })}>
                {l.name} <span className="opacity-60 tabular-nums">{counts.get(l.id) ?? 0}</span>
              </button>
            ))}
          </SlideGroup>
        </div>
      </NavSlot>

      <section className="card mb-6 p-5" aria-label="Tambah diksi">
        <WordForm key={active ?? "all"} languages={languages} defaultLanguageId={active} action={createWord} onSaved={onSaved} idPrefix="add" />
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-2" role="search">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            value={f.q ?? ""}
            onChange={(e) => update({ q: e.target.value || undefined })}
            placeholder="Cari diksi, cara baca, arti…  ( / )"
            className="input pl-9"
            aria-label="Cari diksi"
          />
        </div>
        {(f.q || active) && (
          <button type="button" onClick={() => update({ q: undefined, bahasa: undefined })} className="inline-flex min-h-11 items-center gap-1 text-sm text-accent hover:text-accent-hover">
            <X className="size-3.5" aria-hidden="true" /> Hapus filter
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          shapes={[
            ["half", "blue"],
            ["circle", "yellow"],
            ["triangle", "red"],
          ]}
          title={words.length === 0 ? "Belum ada diksi" : "Tidak ada diksi yang cocok"}
          description={
            words.length === 0
              ? "Catat kata baru yang kamu temui. Di Perpustakaan, negaranya akan menyala di buku Bahasa."
              : "Coba kata kunci lain atau pilih bahasa lain."
          }
        />
      ) : (
        <ViewSwap key={active ?? "semua"}>
          <ul className="grid gap-3.5 sm:grid-cols-2" aria-label="Diksi">
            {shown.map((w) => {
              const language = byLanguage.get(w.language_id);
              return (
                <ListItemMotion key={w.id} glide={false}>
                  <li className="card flex flex-col p-5">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-[1.375rem] leading-tight font-semibold tracking-tight break-words" lang={language?.code ?? undefined}>
                          {w.word}
                        </p>
                        {w.reading && <p className="mt-0.5 text-sm text-muted">{w.reading}</p>}
                      </div>
                      <span className="shrink-0 font-display text-xs text-muted tabular-nums" title={`Dipelajari ${w.learned_on}`}>
                        W{weekNumberFor(programStart, w.learned_on)}
                      </span>
                    </div>
                    {w.meaning.trim() && <p className="mt-3 text-[0.9375rem] text-text-2">{w.meaning}</p>}
                    {w.example && (
                      <p className="mt-2 border-l-2 border-border-strong pl-3 text-sm text-muted" lang={language?.code ?? undefined}>
                        {w.example}
                      </p>
                    )}
                    <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4">
                      {!active && language && <LanguageChip language={language} />}
                      {w.region && <span className="chip bg-surface-2 text-muted">Khas {COUNTRY_NAMES[w.region] ?? w.region}</span>}
                      <span className="ml-auto flex gap-1">
                        <button type="button" className="icon-btn size-9" aria-label={`Ubah ${w.word}`} onClick={() => setEditing(w)}>
                          <Pencil className="size-4" />
                        </button>
                        <button type="button" className="icon-btn size-9" aria-label={`Hapus ${w.word}`} onClick={() => remove(w)}>
                          <Trash2 className="size-4" />
                        </button>
                      </span>
                    </div>
                  </li>
                </ListItemMotion>
              );
            })}
          </ul>
        </ViewSwap>
      )}

      {editing && (
        <EditWordDialog
          word={editing}
          languages={languages}
          onClose={() => setEditing(null)}
          onSaved={(word) => {
            setEditing(null);
            toast({ message: `“${word.word}” diperbarui.` });
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function EditWordDialog({
  word,
  languages,
  onClose,
  onSaved,
}: {
  word: StudyWord;
  languages: readonly StudyLanguage[];
  onClose: () => void;
  onSaved: (word: StudyWord) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog w-[min(40rem,calc(100vw-2rem))]"
      aria-label={`Ubah ${word.word}`}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && ref.current?.close()}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">Ubah diksi</h2>
        <button type="button" className="icon-btn -mt-1 -mr-2 size-9" aria-label="Tutup" onClick={() => ref.current?.close()}>
          <X className="size-4" />
        </button>
      </div>
      <WordForm word={word} languages={languages} action={(fd) => updateWord(word.id, fd)} onSaved={onSaved} submitLabel="Simpan perubahan" idPrefix="edit" />
    </dialog>
  );
}

/** First run: pick the first language from the starting list (or make one's own in "Kelola bahasa" later). */
function FirstLanguage({ onAdded }: { onAdded: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pick = (p: LanguagePreset) => {
    setBusy(p.code);
    void callAction(() => createLanguage({ name: p.name, code: p.code, countries: p.countries, color: p.color })).then((result) => {
      setBusy(null);
      if (result && "error" in result) return setError(result.error);
      toast({ message: `Bahasa ${p.name} ditambahkan.` });
      onAdded();
    });
  };
  return (
    <>
      <PageHeader
        title="Bahasa"
        description="Pilih bahasa pertama yang sedang kamu pelajari. Negaranya menyala di buku Bahasa di Perpustakaan setiap kali kamu mencatat diksi baru; negara dan warnanya bisa diubah nanti."
      />
      <section aria-label="Bahasa bawaan" className="max-w-3xl">
        <PresetGrid presets={LANGUAGE_PRESETS} onPick={pick} busy={busy} />
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        <p className="mt-4 text-sm text-muted">Bahasa lain (mis. Bahasa Sasak) bisa dibuat sendiri di “Kelola bahasa” setelah bahasa pertama ada.</p>
      </section>
    </>
  );
}
