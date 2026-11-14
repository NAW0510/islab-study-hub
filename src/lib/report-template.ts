import type { ReportProfile, WeeklyReport } from "./types";
import { formatDate } from "./utils";

/**
 * First day of Week 1 of the IS Lab intern programme 2026 (Guidebook Mentee,
 * bagian C). A Monday: programme weeks run Monday–Sunday.
 */
export const DEFAULT_PROGRAM_START = "2026-09-28";

export type ReportField = Extract<
  keyof WeeklyReport,
  | "learning_worked_on"
  | "learning_learned"
  | "learning_challenge"
  | "learning_next_target"
  | "project_done"
  | "project_decisions"
  | "project_next"
  | "project_obstacles"
>;

/** "Tabel Weekly Progress" — the questions are kept exactly as in the guidebook. */
export const LEARNING_SECTIONS: { key: ReportField; label: string; hint: string }[] = [
  {
    key: "learning_worked_on",
    label: "What did you work on this week?",
    hint: "Materi, tugas, eksperimen, atau bagian proyek yang dikerjakan.",
  },
  {
    key: "learning_learned",
    label: "What did you learn or discover?",
    hint: "Konsep baru, insight, atau hasil eksperimen.",
  },
  {
    key: "learning_challenge",
    label: "What was your main challenge?",
    hint: "Kendala utama dan bagaimana kamu menghadapinya.",
  },
  {
    key: "learning_next_target",
    label: "What is your target for next week?",
    hint: "Target yang konkret dan bisa dicek minggu depan.",
  },
];

/** The four things reported during the Weekly Meeting with the mentor. */
export const PROJECT_SECTIONS: { key: ReportField; label: string; hint: string }[] = [
  {
    key: "project_done",
    label: "Apa yang sudah dilakukan dalam proyek?",
    hint: "Progress reproduksi paper, dataset, preprocessing, training, evaluasi…",
  },
  {
    key: "project_decisions",
    label: "Diskusi keputusan yang dilakukan oleh kelompok dalam proyek",
    hint: "Keputusan penting kelompok beserta alasannya.",
  },
  {
    key: "project_next",
    label: "Apa yang akan dilakukan dalam proyek?",
    hint: "Rencana langkah berikutnya.",
  },
  {
    key: "project_obstacles",
    label: "Apa kendala yang dialami dalam proyek?",
    hint: "Kendala teknis/non-teknis yang perlu dibahas dengan mentor.",
  },
];

export const STATUS_LABELS = { draft: "Draft", sent: "Terkirim" } as const;

const DAY = 86_400_000;

export function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Week number of a date within the programme; anything before Week 1 is 0 ("Onboarding"). */
export function weekNumberFor(programStart: string, isoDate: string) {
  const days = Math.floor((Date.parse(`${isoDate}T00:00:00Z`) - Date.parse(`${programStart}T00:00:00Z`)) / DAY);
  return Math.max(0, Math.floor(days / 7) + 1);
}

/**
 * Seven-day period of a programme week, starting on the weekday of
 * `programStart` (Monday by default). Week 0 = the week before Week 1.
 */
export function weekPeriod(programStart: string, week: number) {
  const start = addDays(programStart, (week - 1) * 7);
  return { start, end: addDays(start, 6) };
}

export function weekLabel(week: number) {
  return week === 0 ? "Onboarding" : `Week ${week}`;
}

/** Two-digit form for the app chrome and page markers: "Week 07". */
export function weekMarker(week: number) {
  return week === 0 ? "Onboarding" : `Week ${String(week).padStart(2, "0")}`;
}

/** The programme week that contains `today`, with its period, ready for display. */
export function currentWeekInfo(programStart: string | null | undefined, today: string) {
  const start = programStart ?? DEFAULT_PROGRAM_START;
  const week = weekNumberFor(start, today);
  const period = weekPeriod(start, week);
  return { week, period, marker: weekMarker(week), periodLabel: formatPeriod(period.start, period.end) };
}

export function formatPeriod(start: string, end: string) {
  return `${formatDate(start, { withYear: false })} – ${formatDate(end)}`;
}

export function groupLabel(profile: ReportProfile | null) {
  if (!profile?.group_number && !profile?.group_name) return null;
  return [profile.group_number, profile.group_name].filter(Boolean).join(" — ");
}

export function reportTitle(report: Pick<WeeklyReport, "week_number">, profile: ReportProfile | null) {
  const name = profile?.full_name?.trim();
  return `Weekly Progress ${weekLabel(report.week_number)}${name ? ` - ${name}` : ""}`;
}

export function reportFileName(report: Pick<WeeklyReport, "week_number">, profile: ReportProfile | null) {
  return reportTitle(report, profile)
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasProjectContent(report: WeeklyReport) {
  return PROJECT_SECTIONS.some((s) => report[s.key].trim());
}

/** Markdown → text that reads well in WhatsApp/Telegram chat. */
function markdownToChat(md: string) {
  return md
    .replace(/\r\n/g, "\n")
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/__(.+?)__/g, "*$1*")
    .replace(/^(\s*)[-*+]\s+\[( |x|X)\]\s+/gm, (_m, indent: string, done: string) => `${indent}${done.trim() ? "✅" : "⬜"} `)
    .replace(/^(\s*)[-*+]\s+/gm, "$1• ")
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/\$\$([\s\S]+?)\$\$/g, "$1")
    .replace(/(^|[^\\$])\$([^$\n]+)\$/g, "$1$2")
    // Tables: drop the |---| separator row and show each row as "a · b".
    .replace(/^\s*\|?(\s*:?-{2,}:?\s*\|)+\s*:?-*:?\s*$\n?/gm, "")
    .replace(/^\s*\|(.+)\|\s*$/gm, (_m, cells: string) =>
      cells
        .split("|")
        .map((c) => c.trim())
        .join(" · "),
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Plain-text version of the report, formatted for the mentor chat. */
export function reportToChatText(report: WeeklyReport, profile: ReportProfile | null) {
  const lines: string[] = [`*Weekly Progress — ${weekLabel(report.week_number)}*`];
  if (profile?.full_name) lines.push(`Nama: ${profile.full_name}`);
  const group = groupLabel(profile);
  if (group) lines.push(`Kelompok: ${group}`);
  lines.push(`Week: ${report.week_number} (${formatPeriod(report.period_start, report.period_end)})`);

  lines.push("", "*Learning Progress*");
  LEARNING_SECTIONS.forEach((s, i) => {
    lines.push(`*${i + 1}. ${s.label}*`, markdownToChat(report[s.key]) || "-", "");
  });

  if (hasProjectContent(report)) {
    lines.push("*Project Progress*");
    PROJECT_SECTIONS.forEach((s, i) => {
      if (report[s.key].trim()) lines.push(`*${i + 1}. ${s.label}*`, markdownToChat(report[s.key]), "");
    });
  }

  if (report.links.trim()) lines.push("*Tautan*", markdownToChat(report.links));
  return lines.join("\n").trim();
}
