import type { ResourceType } from "./types";

export const TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE || "Asia/Jakarta";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Formats a `date` (YYYY-MM-DD) or `timestamptz` value for display in Indonesian. */
export function formatDate(value: string | null | undefined, opts?: { withYear?: boolean }) {
  if (!value) return "";
  const withYear = opts?.withYear ?? true;
  const isDateOnly = DATE_ONLY.test(value);
  const date = new Date(isDateOnly ? `${value}T00:00:00Z` : value);
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: isDateOnly ? "UTC" : TIMEZONE,
  }).format(date);
}

/** Today's date as YYYY-MM-DD in the app timezone. */
export function todayISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date());
}

export function daysFromToday(isoDate: string) {
  const today = Date.parse(`${todayISO()}T00:00:00Z`);
  const target = Date.parse(`${isoDate}T00:00:00Z`);
  return Math.round((target - today) / 86_400_000);
}

export function getYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
    if (host === "youtube.com" || host === "music.youtube.com") {
      const v = u.searchParams.get("v");
      if (v) return v;
      const match = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{6,})/);
      return match?.[1] ?? null;
    }
  } catch {
    // not a URL
  }
  return null;
}

export function isYouTubeUrl(url: string | null | undefined) {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.replace(/^www\.|^m\./, "");
    return host === "youtube.com" || host === "youtu.be" || host === "music.youtube.com";
  } catch {
    return false;
  }
}

export function guessResourceType(url: string): ResourceType {
  if (isYouTubeUrl(url)) return "youtube";
  const lower = url.toLowerCase();
  if (/\.(pdf|docx?|pptx?|xlsx?|ipynb)(\?|#|$)/.test(lower) || lower.includes("docs.google.com") || lower.includes("drive.google.com")) {
    return "document";
  }
  if (/coursera|udemy|edx|kaggle\.com\/learn|deeplearning\.ai|dicoding/.test(lower)) return "course";
  return "article";
}

export function hostnameOf(url: string | null | undefined) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** "ML, Regression,  ml" → ["ml", "regression"] */
export function parseTags(input: string) {
  const tags = input
    .split(/[,\n]/)
    .map((t) => t.trim().replace(/^#/, "").toLowerCase())
    .filter(Boolean);
  return [...new Set(tags)].slice(0, 20);
}

/** Plain-text preview of a Markdown note. */
export function excerpt(markdown: string, length = 160) {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " [rumus] ")
    .replace(/\$([^$\n]+)\$/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > length ? `${text.slice(0, length).trimEnd()}…` : text;
}

/** Lower-case and strip accents so "Régression" matches "regression". */
export function normalizeSearch(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Only allow same-origin relative redirects (blocks `//evil.com`). */
export function safeNextPath(next: unknown) {
  if (typeof next !== "string") return "/";
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}

export function percent(done: number, total: number) {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}
