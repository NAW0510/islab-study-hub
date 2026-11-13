import {
  formatPeriod,
  groupLabel,
  hasProjectContent,
  LEARNING_SECTIONS,
  PROJECT_SECTIONS,
  weekLabel,
} from "@/lib/report-template";
import type { ReportProfile, WeeklyReport } from "@/lib/types";
import { Markdown } from "./markdown";

/**
 * The report as a sheet of paper. Always light (like the PDF/Word output),
 * so it looks the same in dark mode, when printed and on a shared link.
 */
export function ReportDocument({ report, profile }: { report: WeeklyReport; profile: ReportProfile | null }) {
  const info: [string, string][] = [];
  if (profile?.full_name) info.push(["Nama", profile.full_name]);
  const group = groupLabel(profile);
  if (group) info.push(["Kelompok", group]);
  info.push(["Week", `${weekLabel(report.week_number)} · ${formatPeriod(report.period_start, report.period_end)}`]);
  if (profile?.mentor_name) info.push(["Mentor", profile.mentor_name]);

  return (
    <article className="report-paper mx-auto w-full max-w-[210mm] rounded-xl border border-border bg-surface px-6 py-8 shadow-sm sm:px-12 sm:py-12 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header className="border-b border-border pb-6">
        <p className="text-xs font-semibold tracking-[0.14em] text-accent uppercase">Weekly Progress Report</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{weekLabel(report.week_number)}</h1>
        <p className="mt-1 text-sm text-muted">Intelligent Systems Lab FILKOM — Intern 2026</p>
        <dl className="mt-6 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[7rem_1fr]">
          {info.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="font-medium text-muted">{label}</dt>
              <dd className="-mt-1.5 sm:mt-0">{value}</dd>
            </div>
          ))}
        </dl>
      </header>

      <ReportSection title="Learning Progress" sections={LEARNING_SECTIONS} report={report} />
      {hasProjectContent(report) && (
        <ReportSection title="Project Progress" sections={PROJECT_SECTIONS} report={report} skipEmpty />
      )}

      {report.links.trim() && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold">Tautan & Lampiran</h2>
          <Markdown content={report.links} />
        </section>
      )}
    </article>
  );
}

function ReportSection({
  title,
  sections,
  report,
  skipEmpty = false,
}: {
  title: string;
  sections: typeof LEARNING_SECTIONS;
  report: WeeklyReport;
  skipEmpty?: boolean;
}) {
  // Keep the guidebook's numbering even when empty questions are skipped.
  const visible = sections
    .map((s, i) => ({ ...s, number: i + 1 }))
    .filter((s) => !skipEmpty || report[s.key].trim());
  return (
    <section className="mt-10">
      <h2 className="mb-5 text-lg font-semibold">{title}</h2>
      <ol className="space-y-7">
        {visible.map((s) => (
          <li key={s.key} className="break-inside-avoid-page">
            <h3 className="mb-2 flex gap-2.5 font-semibold">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs text-accent tabular-nums">
                {s.number}
              </span>
              <span className="pt-0.5">{s.label}</span>
            </h3>
            <div className="pl-8.5">
              {report[s.key].trim() ? (
                <Markdown content={report[s.key]} />
              ) : (
                <p className="text-sm text-muted italic">Belum diisi.</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
