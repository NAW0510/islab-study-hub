import { describe, expect, it } from "vitest";
import type { StudyLanguage, StudyWord } from "../types";
import { cleanCountries, LANGUAGE_PRESETS, remainingPresets, wordsByCountry } from "./languages";

const lang = (id: string, name: string, countries: string[], color = "domain-1"): StudyLanguage => ({
  id,
  name,
  code: null,
  countries,
  color,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
});
const word = (id: string, languageId: string, learnedOn: string, region: string | null = null): StudyWord => ({
  id,
  language_id: languageId,
  word: id,
  reading: null,
  meaning: "",
  example: null,
  notes: null,
  region,
  learned_on: learnedOn,
  created_at: `${learnedOn}T00:00:00Z`,
  updated_at: `${learnedOn}T00:00:00Z`,
});

describe("wordsByCountry", () => {
  const es = lang("es", "Spanyol", ["ES", "MX"], "domain-4");
  const en = lang("en", "Inggris", ["US", "CA"], "domain-1");
  const fr = lang("fr", "Prancis", ["FR", "CA"], "domain-7");
  const words = [
    word("coche", "es", "2026-11-02"),
    word("carro", "es", "2026-11-05", "MX"),
    word("car", "en", "2026-11-03"),
    word("voiture", "fr", "2026-11-04"),
    word("bagnole", "fr", "2026-11-06"),
  ];
  const map = wordsByCountry([es, en, fr], words);

  it("shows a word in every country of its language, and a regional word in its country only", () => {
    expect(map.get("ES")?.languages[0].words.map((w) => w.id)).toEqual(["coche"]);
    expect(map.get("MX")?.languages[0].words.map((w) => w.id)).toEqual(["carro", "coche"]);
  });

  it("puts the language with the most words first, and lights the country in its colour", () => {
    const ca = map.get("CA");
    expect(ca?.languages.map((l) => l.language.id)).toEqual(["fr", "en"]);
    expect(ca?.total).toBe(3);
    expect(ca?.color).toBe("domain-7");
  });

  it("lists a language's countries before its first word, unlit", () => {
    const empty = wordsByCountry([lang("ja", "Jepang", ["JP"])], []);
    expect(empty.get("JP")).toMatchObject({ total: 0, color: null });
  });

  it("ignores words whose language is gone", () => {
    expect(wordsByCountry([es], [word("x", "missing", "2026-11-01")]).get("ES")?.total).toBe(0);
  });
});

describe("cleanCountries", () => {
  it("keeps upper-case alpha-2 codes once, in order", () => {
    expect(cleanCountries([" jp", "US", "jp", "USA", "", "x1", "id"])).toEqual(["JP", "US", "ID"]);
  });
});

describe("presets", () => {
  it("use valid, unique codes and countries", () => {
    const codes = LANGUAGE_PRESETS.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const p of LANGUAGE_PRESETS) {
      expect(p.code).toMatch(/^[a-z]{2,3}$/);
      expect(cleanCountries(p.countries)).toEqual(p.countries);
      expect(p.countries.length).toBeGreaterThan(0);
    }
  });

  it("leave out what was already added, by code or by name", () => {
    const left = remainingPresets([
      { code: "ja", name: "Bahasa Jepang" },
      { code: null, name: "inggris" },
    ]);
    expect(left.some((p) => p.code === "ja" || p.code === "en")).toBe(false);
    expect(left.length).toBe(LANGUAGE_PRESETS.length - 2);
  });
});

describe("presets and the atlas", () => {
  it("only name countries the atlas has", async () => {
    const { COUNTRY_NAMES } = await import("./atlas/country-names");
    for (const p of LANGUAGE_PRESETS) for (const c of p.countries) expect(COUNTRY_NAMES[c], `${p.name} → ${c}`).toBeTruthy();
  });
});
