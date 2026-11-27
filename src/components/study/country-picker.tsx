"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { COUNTRY_NAMES } from "@/lib/study/atlas/country-names";
import { normalizeSearch } from "@/lib/utils";

const ALL = Object.entries(COUNTRY_NAMES).map(([code, name]) => ({ code, name, hay: normalizeSearch(`${name} ${code}`) }));

/**
 * The countries a language lights up on the atlas: the chosen ones as chips
 * (× takes one off), then a searchable checklist of every country on the
 * atlas. Controlled: `value` is the list of alpha-2 codes, in the order picked.
 */
export function CountryPicker({ value, onChange, id }: { value: readonly string[]; onChange: (next: string[]) => void; id: string }) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
    return words.length ? ALL.filter((c) => words.every((w) => c.hay.includes(w))) : ALL;
  }, [query]);
  const chosen = new Set(value);
  const toggle = (code: string) => onChange(chosen.has(code) ? value.filter((c) => c !== code) : [...value, code]);

  return (
    <div>
      {value.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="Negara terpilih">
          {value.map((code) => (
            <li key={code}>
              <button type="button" className="chip bg-surface-2 text-text hover:opacity-80" onClick={() => toggle(code)} aria-label={`Lepas ${COUNTRY_NAMES[code] ?? code}`}>
                {COUNTRY_NAMES[code] ?? code}
                <X className="size-3 text-muted" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-2 text-sm text-muted">Belum ada negara: diksinya belum menyala di peta.</p>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          id={id}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari negara…"
          className="input pl-9"
          autoComplete="off"
        />
      </div>
      <ul className="mt-2 max-h-48 overflow-y-auto rounded-control border border-border" aria-label="Semua negara">
        {shown.map((c) => (
          <li key={c.code}>
            <label className="flex min-h-9 cursor-pointer items-center gap-2.5 px-3 text-sm hover:bg-surface-2">
              <input type="checkbox" checked={chosen.has(c.code)} onChange={() => toggle(c.code)} className="size-4 accent-[var(--accent)]" />
              <span className="flex-1">{c.name}</span>
              <span className="font-display text-xs text-muted">{c.code}</span>
            </label>
          </li>
        ))}
        {shown.length === 0 && <li className="px-3 py-2 text-sm text-muted">Tidak ada negara yang cocok.</li>}
      </ul>
    </div>
  );
}
