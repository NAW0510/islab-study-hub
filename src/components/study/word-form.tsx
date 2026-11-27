"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { SaveWordResult } from "@/lib/actions/study";
import { COUNTRY_NAMES } from "@/lib/study/atlas/country-names";
import type { StudyLanguage, StudyWord } from "@/lib/types";
import { cn, todayISO } from "@/lib/utils";
import { ActionForm, SubmitButton } from "../action-form";

/**
 * One diksi's fields, for adding (Bahasa page, the atlas's quick add) and
 * editing (the edit dialog). The word, how it reads and what it means come
 * first; an example, notes, a country of its own and the date fold under
 * "Lainnya". The meaning is the user's own words (spec §0).
 */
export function WordForm({
  languages,
  word,
  defaultLanguageId,
  defaultRegion,
  action,
  onSaved,
  compact = false,
  submitLabel = "Simpan diksi",
  idPrefix = "word",
}: {
  languages: readonly StudyLanguage[];
  word?: StudyWord;
  defaultLanguageId?: string;
  /** Pre-ticks "khas negara ini" (the atlas's country). */
  defaultRegion?: string;
  action: (formData: FormData) => Promise<SaveWordResult>;
  onSaved: (word: StudyWord) => void;
  /** The atlas's panel: fewer fields shown at once. */
  compact?: boolean;
  submitLabel?: string;
  idPrefix?: string;
}) {
  const [languageId, setLanguageId] = useState(word?.language_id ?? defaultLanguageId ?? languages[0]?.id ?? "");
  const [more, setMore] = useState(Boolean(word && (word.example || word.notes || word.region)));
  const language = languages.find((l) => l.id === languageId);
  const regionChoices = [...new Set([...(language?.countries ?? []), ...(word?.region ? [word.region] : []), ...(defaultRegion ? [defaultRegion] : [])])];
  const id = (name: string) => `${idPrefix}-${name}`;

  return (
    <ActionForm
      action={async (formData) => {
        const result = await action(formData);
        if ("error" in result) return result;
        onSaved(result.word);
      }}
      resetOnSuccess={!word}
      className={cn("grid gap-3", !compact && "sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_minmax(0,1fr)]")}
    >
      {languages.length > 1 ? (
        <div>
          <label className="label" htmlFor={id("language")}>
            Bahasa
          </label>
          <select id={id("language")} name="language_id" value={languageId} onChange={(e) => setLanguageId(e.target.value)} className="input">
            {languages.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <input type="hidden" name="language_id" value={languageId} />
      )}
      <div className={cn(languages.length <= 1 && !compact && "sm:col-span-2")}>
        <label className="label" htmlFor={id("word")}>
          Diksi
        </label>
        <input
          id={id("word")}
          name="word"
          required
          maxLength={200}
          defaultValue={word?.word}
          placeholder={language?.code === "ja" ? "勉強" : "mis. serendipity"}
          className="input font-display text-[1.0625rem]"
          autoComplete="off"
          lang={language?.code ?? undefined}
        />
      </div>
      <div>
        <label className="label" htmlFor={id("reading")}>
          Cara baca <span className="font-normal text-muted">(opsional)</span>
        </label>
        <input
          id={id("reading")}
          name="reading"
          maxLength={200}
          defaultValue={word?.reading ?? ""}
          placeholder={language?.code === "ja" ? "benkyou" : "romanisasi, pelafalan"}
          className="input"
          autoComplete="off"
        />
      </div>
      <div className={cn(!compact && "sm:col-span-3")}>
        <label className="label" htmlFor={id("meaning")}>
          Arti <span className="font-normal text-muted">(dengan kata-katamu sendiri)</span>
        </label>
        <textarea id={id("meaning")} name="meaning" rows={2} maxLength={2000} defaultValue={word?.meaning} className="input" />
      </div>

      <div className={cn(!compact && "sm:col-span-3")}>
        <button
          type="button"
          className="inline-flex min-h-9 items-center gap-1.5 text-sm text-muted hover:text-text"
          aria-expanded={more}
          onClick={() => setMore((m) => !m)}
        >
          <ChevronDown className={cn("size-4 transition-transform", more && "rotate-180")} aria-hidden="true" />
          Lainnya: contoh, catatan, negara khas, tanggal
        </button>
      </div>
      <div className={cn("grid gap-3", !compact && "sm:col-span-3 sm:grid-cols-2", !more && "hidden")}>
        <div className={cn(!compact && "sm:col-span-2")}>
          <label className="label" htmlFor={id("example")}>
            Contoh kalimat
          </label>
          <textarea id={id("example")} name="example" rows={2} maxLength={2000} defaultValue={word?.example ?? ""} className="input" lang={language?.code ?? undefined} />
        </div>
        <div className={cn(!compact && "sm:col-span-2")}>
          <label className="label" htmlFor={id("notes")}>
            Catatan
          </label>
          <textarea id={id("notes")} name="notes" rows={2} maxLength={4000} defaultValue={word?.notes ?? ""} className="input" />
        </div>
        <div>
          <label className="label" htmlFor={id("region")}>
            Khas negara
          </label>
          <select id={id("region")} name="region" defaultValue={word?.region ?? defaultRegion ?? ""} className="input" key={languageId}>
            <option value="">Semua negara bahasanya</option>
            {regionChoices.map((code) => (
              <option key={code} value={code}>
                {COUNTRY_NAMES[code] ?? code}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={id("learned")}>
            Tanggal belajar
          </label>
          <input id={id("learned")} type="date" name="learned_on" defaultValue={word?.learned_on ?? todayISO()} className="input" />
        </div>
      </div>

      <div className={cn("flex justify-end", !compact && "sm:col-span-3")}>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}
