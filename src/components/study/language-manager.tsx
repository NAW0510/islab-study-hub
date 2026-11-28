"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Settings2, Trash2, X } from "lucide-react";
import { createLanguage, deleteLanguage, updateLanguage } from "@/lib/actions/study";
import { callAction } from "@/lib/call-action";
import { COUNTRY_NAMES } from "@/lib/study/atlas/country-names";
import { LANGUAGE_COLORS, languageColor, remainingPresets, type LanguagePreset } from "@/lib/study/languages";
import type { StudyLanguage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DOMAIN_COLOR_LABELS, DOMAIN_TONE_CLASS, type DomainColor } from "@/lib/vocab/seed-domains";
import { FormError } from "../action-form";
import { useToast } from "../toast";
import { CountryPicker } from "./country-picker";

/** A language's name with its colour's mark. */
export function LanguageChip({ language, className }: { language: Pick<StudyLanguage, "name" | "color">; className?: string }) {
  return <span className={cn("chip chip-tone", DOMAIN_TONE_CLASS[languageColor(language)], className)}>{language.name}</span>;
}

/** The starting list, one click each (the Bahasa page's first run and the manager's "Tambah"). */
export function PresetGrid({ presets, onPick, busy }: { presets: readonly LanguagePreset[]; onPick: (p: LanguagePreset) => void; busy: string | null }) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {presets.map((p) => (
        <li key={p.code}>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => onPick(p)}
            className={cn("flex w-full items-center gap-2.5 rounded-control border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:border-border-strong", busy === p.code && "opacity-60")}
          >
            <span className={cn("chip-tone size-3 shrink-0 rounded-full p-0", DOMAIN_TONE_CLASS[p.color])} style={{ backgroundColor: `var(--${p.color})` }} />
            <span className="min-w-0 flex-1">
              <span className="block font-display text-sm font-semibold tracking-tight">{p.name}</span>
              <span className="block truncate text-xs text-muted">{p.countries.map((c) => COUNTRY_NAMES[c] ?? c).join(", ")}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

type Draft = { id: string | null; name: string; code: string; color: DomainColor; countries: string[] };

/**
 * "Kelola bahasa": the languages with their colours, countries and word
 * counts; add one from the starting list or make one's own; change a
 * language's name, colour and countries; delete one that has no words left.
 */
export function LanguageManager({
  languages,
  counts,
  compact = false,
}: {
  languages: readonly StudyLanguage[];
  counts: ReadonlyMap<string, number>;
  /** A small button (inside the Bahasa book). */
  compact?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const presets = remainingPresets(languages);

  const open = () => {
    setDraft(null);
    setError(null);
    dialogRef.current?.showModal();
  };
  const close = () => dialogRef.current?.close();

  const addPreset = (p: LanguagePreset) => {
    setBusy(p.code);
    startTransition(async () => {
      const result = await callAction(() => createLanguage({ name: p.name, code: p.code, countries: p.countries, color: p.color }));
      setBusy(null);
      if (result && "error" in result) return setError(result.error);
      setError(null);
      toast({ message: `Bahasa ${p.name} ditambahkan.` });
      router.refresh();
    });
  };
  const save = () => {
    if (!draft) return;
    startTransition(async () => {
      const input = { name: draft.name, code: draft.code || null, countries: draft.countries, color: draft.color };
      const result = await callAction(() => (draft.id ? updateLanguage(draft.id, input) : createLanguage(input)));
      if (result && "error" in result) return setError(result.error);
      setError(null);
      setDraft(null);
      toast({ message: draft.id ? "Bahasa diperbarui." : `Bahasa ${input.name} ditambahkan.` });
      router.refresh();
    });
  };
  const remove = (language: StudyLanguage) => {
    startTransition(async () => {
      const result = await callAction(() => deleteLanguage(language.id));
      if (result && "error" in result) return setError(result.error);
      setError(null);
      toast({ message: `Bahasa ${language.name} dihapus.` });
      router.refresh();
    });
  };

  return (
    <>
      <button type="button" className={cn("btn btn-secondary", compact && "btn-sm")} onClick={open}>
        <Settings2 className="size-4" aria-hidden="true" /> Kelola bahasa
      </button>
      <dialog ref={dialogRef} className="dialog w-[min(44rem,calc(100vw-2rem))]" aria-label="Kelola bahasa" onClick={(e) => e.target === e.currentTarget && close()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight">{draft ? (draft.id ? `Ubah ${draft.name || "bahasa"}` : "Bahasa baru") : "Kelola bahasa"}</h2>
            <p className="mt-1 text-sm text-muted">
              {draft ? "Negaranya menentukan di mana diksinya menyala di peta Perpustakaan." : "Warna dan negara tiap bahasa dipakai di atlas Perpustakaan."}
            </p>
          </div>
          <button type="button" className="icon-btn -mt-1 -mr-2 size-9" aria-label="Tutup" onClick={close}>
            <X className="size-4" />
          </button>
        </div>

        {draft ? (
          <div className="mt-4 grid gap-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
              <div>
                <label className="label" htmlFor="lang-name">
                  Nama
                </label>
                <input id="lang-name" className="input" value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="mis. Bali" />
              </div>
              <div>
                <label className="label" htmlFor="lang-code">
                  Kode <span className="font-normal text-muted">(ISO 639)</span>
                </label>
                <input id="lang-code" className="input" value={draft.code} maxLength={12} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="ban" />
              </div>
            </div>
            <fieldset>
              <legend className="label">Warna</legend>
              <div className="flex flex-wrap gap-1">
                {LANGUAGE_COLORS.map((c) => (
                  <label key={c} className="cursor-pointer" title={DOMAIN_COLOR_LABELS[c]}>
                    <input type="radio" name="lang-color" value={c} checked={draft.color === c} onChange={() => setDraft({ ...draft, color: c })} className="sr-only" />
                    <span className={cn("flex size-8 items-center justify-center rounded-full border-2", draft.color === c ? "border-text" : "border-transparent")}>
                      <span className="size-4 rounded-full" style={{ backgroundColor: `var(--${c})` }} />
                    </span>
                    <span className="sr-only">{DOMAIN_COLOR_LABELS[c]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label className="label" htmlFor="lang-countries">
                Negara
              </label>
              <CountryPicker id="lang-countries" value={draft.countries} onChange={(countries) => setDraft({ ...draft, countries })} />
            </div>
            {error && <FormError message={error} />}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => (setDraft(null), setError(null))}>
                Batal
              </button>
              <button type="button" className="btn btn-primary" disabled={pending || !draft.name.trim()} onClick={save}>
                Simpan bahasa
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid gap-5">
            {languages.length > 0 && (
              <ul className="card divide-y divide-border">
                {languages.map((l) => {
                  const n = counts.get(l.id) ?? 0;
                  return (
                    <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                      <LanguageChip language={l} />
                      <span className="min-w-0 flex-1 truncate text-sm text-muted">
                        {l.countries.length ? l.countries.map((c) => COUNTRY_NAMES[c] ?? c).join(", ") : "Belum ada negara"}
                      </span>
                      <span className="font-display text-xs text-muted tabular-nums">{n} diksi</span>
                      <button
                        type="button"
                        className="icon-btn size-9"
                        aria-label={`Ubah ${l.name}`}
                        onClick={() => setDraft({ id: l.id, name: l.name, code: l.code ?? "", color: languageColor(l) as DomainColor, countries: [...l.countries] })}
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        className="icon-btn size-9"
                        aria-label={`Hapus ${l.name}`}
                        title={n > 0 ? "Hapus diksinya dulu" : "Hapus bahasa"}
                        disabled={pending || n > 0}
                        onClick={() => remove(l)}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {error && <FormError message={error} />}
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="font-display text-sm font-semibold tracking-tight">Tambah bahasa</h3>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft({ id: null, name: "", code: "", color: "domain-1", countries: [] })}>
                  <Plus className="size-4" aria-hidden="true" /> Bahasa sendiri
                </button>
              </div>
              {presets.length > 0 ? (
                <PresetGrid presets={presets} onPick={addPreset} busy={busy} />
              ) : (
                <p className="text-sm text-muted">Semua bahasa bawaan sudah ditambahkan.</p>
              )}
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
