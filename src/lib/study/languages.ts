import type { StudyLanguage, StudyWord } from "../types";
import { asDomainColor, type DomainColor } from "../vocab/seed-domains";

/**
 * Ruang Studi › Bahasa: the starting list of languages and how words land on
 * the atlas's countries (docs/SPEC_RUANG_STUDI.md §3–§4).
 *
 * A language lights up its countries (ISO 3166-1 alpha-2). A word with a
 * `region` belongs to that one country only (a regional word: "carro" in
 * Mexico); without one, it shows in every country of its language. Every
 * preset can be changed after it is added, and a language of one's own
 * (Bahasa Bali → Indonesia) works the same.
 */

export type LanguagePreset = { code: string; name: string; countries: string[]; color: DomainColor };

export const LANGUAGE_PRESETS: readonly LanguagePreset[] = [
  { code: "ja", name: "Jepang", countries: ["JP"], color: "domain-8" },
  { code: "en", name: "Inggris", countries: ["US", "GB", "CA", "AU", "NZ", "IE"], color: "domain-1" },
  { code: "ko", name: "Korea", countries: ["KR"], color: "domain-5" },
  { code: "zh", name: "Mandarin", countries: ["CN", "TW", "SG"], color: "domain-2" },
  {
    code: "ar",
    name: "Arab",
    countries: ["SA", "AE", "EG", "JO", "IQ", "SY", "LB", "MA", "DZ", "TN", "LY", "OM", "YE", "KW", "QA", "BH", "SD", "PS"],
    color: "domain-6",
  },
  { code: "de", name: "Jerman", countries: ["DE", "AT", "CH", "LI", "LU"], color: "domain-10" },
  { code: "fr", name: "Prancis", countries: ["FR", "BE", "CH", "LU", "MC", "CA", "SN", "CI"], color: "domain-7" },
  {
    code: "es",
    name: "Spanyol",
    countries: ["ES", "MX", "AR", "CO", "CL", "PE", "VE", "EC", "GT", "CU", "BO", "DO", "HN", "PY", "SV", "NI", "CR", "PA", "UY"],
    color: "domain-4",
  },
  { code: "pt", name: "Portugis", countries: ["PT", "BR", "AO", "MZ"], color: "domain-3" },
  { code: "nl", name: "Belanda", countries: ["NL", "BE", "SR"], color: "domain-2" },
  { code: "ru", name: "Rusia", countries: ["RU", "BY", "KZ", "KG"], color: "domain-9" },
  { code: "it", name: "Italia", countries: ["IT", "SM", "CH"], color: "domain-6" },
  { code: "th", name: "Thai", countries: ["TH"], color: "domain-5" },
  { code: "vi", name: "Vietnam", countries: ["VN"], color: "domain-3" },
  { code: "ms", name: "Melayu", countries: ["MY", "BN", "SG"], color: "domain-6" },
  { code: "hi", name: "Hindi", countries: ["IN"], color: "domain-2" },
  { code: "tr", name: "Turki", countries: ["TR", "CY"], color: "domain-8" },
  { code: "tl", name: "Tagalog", countries: ["PH"], color: "domain-1" },
  { code: "fa", name: "Persia", countries: ["IR", "AF", "TJ"], color: "domain-7" },
  { code: "sw", name: "Swahili", countries: ["TZ", "KE", "UG"], color: "domain-10" },
  { code: "jv", name: "Jawa", countries: ["ID"], color: "domain-4" },
  { code: "ban", name: "Bali", countries: ["ID"], color: "domain-3" },
];

/** The palette a language can take (the same ten as the fields). */
export const LANGUAGE_COLORS: readonly DomainColor[] = [
  "domain-1",
  "domain-2",
  "domain-3",
  "domain-4",
  "domain-5",
  "domain-6",
  "domain-7",
  "domain-8",
  "domain-9",
  "domain-10",
];

export const languageColor = (language: Pick<StudyLanguage, "color">): DomainColor => asDomainColor(language.color);

/** Upper-case alpha-2 codes, each once, in the order given; anything else is dropped. */
export function cleanCountries(input: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of input) {
    const code = raw.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(code) && !out.includes(code)) out.push(code);
  }
  return out.slice(0, 60);
}

/** The countries a word shows in. */
export function countriesOfWord(word: Pick<StudyWord, "region">, language: Pick<StudyLanguage, "countries">): string[] {
  return word.region ? [word.region] : language.countries;
}

export type CountryLanguage = { language: StudyLanguage; words: StudyWord[] };
export type CountryEntry = {
  code: string;
  /** Languages spoken here (from their countries, or a regional word), most words first. */
  languages: CountryLanguage[];
  total: number;
  /** The colour it lights up in: its language with the most words here. */
  color: DomainColor | null;
};

/**
 * Every country a language or a word points to, with the words that show
 * there (newest first within each language). A language with no words yet
 * still lists its countries, so its places are known before the first word.
 */
export function wordsByCountry(languages: readonly StudyLanguage[], words: readonly StudyWord[]): Map<string, CountryEntry> {
  const byLanguage = new Map(languages.map((l) => [l.id, l]));
  const bucket = new Map<string, Map<string, StudyWord[]>>();
  const slot = (code: string, languageId: string) => {
    let langs = bucket.get(code);
    if (!langs) bucket.set(code, (langs = new Map()));
    let list = langs.get(languageId);
    if (!list) langs.set(languageId, (list = []));
    return list;
  };
  for (const language of languages) for (const code of language.countries) slot(code, language.id);
  const newestFirst = [...words].sort((a, b) => b.learned_on.localeCompare(a.learned_on) || b.created_at.localeCompare(a.created_at));
  for (const word of newestFirst) {
    const language = byLanguage.get(word.language_id);
    if (!language) continue;
    for (const code of countriesOfWord(word, language)) slot(code, language.id).push(word);
  }

  const out = new Map<string, CountryEntry>();
  for (const [code, langs] of bucket) {
    const list: CountryLanguage[] = [...langs]
      .map(([id, ws]) => ({ language: byLanguage.get(id) as StudyLanguage, words: ws }))
      .sort((a, b) => b.words.length - a.words.length || a.language.name.localeCompare(b.language.name, "id"));
    const total = list.reduce((n, l) => n + l.words.length, 0);
    out.set(code, { code, languages: list, total, color: total > 0 ? languageColor(list[0].language) : null });
  }
  return out;
}

/** Presets not added yet (by code or by name), for "Tambah bahasa". */
export function remainingPresets(languages: readonly Pick<StudyLanguage, "code" | "name">[]): LanguagePreset[] {
  const codes = new Set(languages.map((l) => l.code).filter(Boolean));
  const names = new Set(languages.map((l) => l.name.trim().toLowerCase()));
  return LANGUAGE_PRESETS.filter((p) => !codes.has(p.code) && !names.has(p.name.toLowerCase()));
}
