import { stripListMarker } from "../utils";

/** Paste many terms at once: one term per line, optionally followed by its definition. */

export const BULK_MAX_LINES = 100;
export const TERM_MAX_LENGTH = 120;

/** Separators between term and definition. A tab always wins (spreadsheet paste). */
const TEXT_SEPARATORS = [" — ", " – ", " - ", ": "];

export type BulkWarning = "definisi-kosong" | "duplikat-di-tempelan" | "sudah-ada" | "terlalu-panjang";

export type BulkRow = {
  /** 1-based line number in the pasted text. */
  line: number;
  term: string;
  definition: string;
  warnings: BulkWarning[];
  /** False when the row cannot be saved (duplicate or too long). */
  ok: boolean;
};

export type BulkResult = {
  rows: BulkRow[];
  /** Non-empty lines beyond BULK_MAX_LINES; they are not parsed. */
  overflow: number;
};

export const BULK_WARNING_LABELS: Record<BulkWarning, string> = {
  "definisi-kosong": "Tanpa definisi: klasifikasi jadi lemah",
  "duplikat-di-tempelan": "Muncul dua kali di tempelan",
  "sudah-ada": "Sudah ada di Istilah Teknis",
  "terlalu-panjang": `Istilah lebih dari ${TERM_MAX_LENGTH} karakter`,
};

/**
 * Splits one line into term and definition. The split happens at a tab if
 * there is one, otherwise at whichever of ` — `, ` – `, ` - `, `: ` comes
 * first in the line, so "p-value: peluang - bila H0 benar" splits at the colon.
 */
export function splitTermLine(raw: string): { term: string; definition: string } | null {
  // Tabs separate cells, so look for one before trimming around list markers.
  const line = raw.replace(/\s+$/, "");
  const tab = line.indexOf("\t");
  let at = -1;
  let width = 0;

  if (tab > 0) {
    at = tab;
    width = 1;
  } else {
    for (const separator of TEXT_SEPARATORS) {
      const index = line.indexOf(separator);
      if (index > 0 && (at === -1 || index < at)) {
        at = index;
        width = separator.length;
      }
    }
  }

  const term = stripListMarker(at === -1 ? line : line.slice(0, at)).replace(/\s+/g, " ");
  const definition = at === -1 ? "" : line.slice(at + width).trim();
  // A line that is only a list marker ("-", "3.", "[ ]") holds no term.
  if (!term || /^(?:[-*•]|\d+[.)]|\[[ xX]?\])$/.test(term)) return null;
  return { term, definition };
}

const key = (text: string) => text.trim().toLowerCase();

/**
 * Parses pasted text into rows for the preview table.
 * `existing` holds the terms and aliases already saved; matching is case-insensitive.
 */
export function parseBulk(text: string, existing: Iterable<string> = []): BulkResult {
  const taken = new Set([...existing].map(key));
  const seen = new Set<string>();
  const rows: BulkRow[] = [];
  let overflow = 0;

  text.split(/\r?\n/).forEach((raw, index) => {
    const parsed = splitTermLine(raw);
    if (!parsed) return;
    if (rows.length >= BULK_MAX_LINES) {
      overflow += 1;
      return;
    }

    const warnings: BulkWarning[] = [];
    const id = key(parsed.term);
    if (parsed.term.length > TERM_MAX_LENGTH) warnings.push("terlalu-panjang");
    if (taken.has(id)) warnings.push("sudah-ada");
    else if (seen.has(id)) warnings.push("duplikat-di-tempelan");
    if (!parsed.definition) warnings.push("definisi-kosong");
    seen.add(id);

    rows.push({
      line: index + 1,
      ...parsed,
      warnings,
      ok: !warnings.some((w) => w !== "definisi-kosong"),
    });
  });

  return { rows, overflow };
}
