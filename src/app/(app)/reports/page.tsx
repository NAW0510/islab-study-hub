import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Link2, Plus, UserRound } from "lucide-react";
import { ProfileForm } from "@/components/profile-form";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getProfile } from "@/lib/queries";
import {
  DEFAULT_PROGRAM_START,
  formatPeriod,
  STATUS_LABELS,
  weekLabel,
  weekNumberFor,
  weekPeriod,
} from "@/lib/report-template";
import type { WeeklyReport } from "@/lib/types";
import { cn, todayISO } from "@/lib/utils";

export const metadata: Metadata = { title: "Laporan Mingguan" };

type ReportRow = Pick<WeeklyReport, "id" | "week_number" | "period_start" | "period_end" | "status" | "share_token">;

export default async function ReportsPage() {
  const { supabase } = await requireUser();
  const [profile, reportsRes] = await Promise.all([
    getProfile(supabase),
    supabase
      .from("weekly_reports")
      .select("id, week_number, period_start, period_end, status, share_token")
      .order("week_number", { ascending: false }),
  ]);

  const reports = (reportsRes.data ?? []) as ReportRow[];
  const programStart = profile?.program_start ?? DEFAULT_PROGRAM_START;
  const currentWeek = weekNumberFor(programStart, todayISO());
  const byWeek = new Map(reports.map((r) => [r.week_number, r]));
  const lastWeek = Math.max(currentWeek, ...reports.map((r) => r.week_number));
  const weeks = Array.from({ length: lastWeek + 1 }, (_, i) => lastWeek - i);
  const current = byWeek.get(currentWeek);
  const profileIncomplete = !profile?.full_name || !profile?.group_number;

  return (
    <>
      <PageHeader
        title="Laporan Mingguan"
        description="Weekly Progress untuk mentor IS Lab — dikirim setiap Sabtu atau Minggu. Bisa diunduh sebagai PDF/Word atau dibagikan lewat link."
        actions={
          current ? (
            <Link href={`/reports/${current.id}`} className="btn btn-primary">
              Buka laporan {weekLabel(currentWeek)}
            </Link>
          ) : (
            <Link href={`/reports/new?week=${currentWeek}`} className="btn btn-primary">
              <Plus className="size-4" /> Buat laporan {weekLabel(currentWeek)}
            </Link>
          )
        }
      />

      <details className="card group mb-8" open={profileIncomplete}>
        <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
          <span className="flex size-8 items-center justify-center rounded-full bg-accent-soft text-accent">
            <UserRound className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Identitas laporan</span>
            <span className="block truncate text-xs text-muted">
              {profileIncomplete
                ? "Isi nama & nomor kelompok supaya muncul di kepala laporan."
                : [profile?.full_name, `Kelompok ${profile?.group_number}`, profile?.mentor_name && `Mentor: ${profile.mentor_name}`]
                    .filter(Boolean)
                    .join(" · ")}
            </span>
          </span>
          <ChevronRight className="size-4 text-muted transition group-open:rotate-90" />
        </summary>
        <div className="border-t border-border p-4">
          <ProfileForm profile={profile} />
        </div>
      </details>

      <ol className="card divide-y divide-border">
        {weeks.map((week) => {
          const report = byWeek.get(week);
          const period = report
            ? { start: report.period_start, end: report.period_end }
            : weekPeriod(programStart, week);
          const isCurrent = week === currentWeek;
          return (
            <li key={week}>
              <Link
                href={report ? `/reports/${report.id}` : `/reports/new?week=${week}`}
                className="flex items-center gap-4 px-4 py-3.5 transition hover:bg-surface-2/60"
              >
                <span
                  className={cn(
                    "flex size-10 shrink-0 flex-col items-center justify-center rounded-control font-display text-xs font-semibold leading-none",
                    isCurrent ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted",
                  )}
                >
                  {week === 0 ? "On" : <span className="text-base">{week}</span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {weekLabel(week)}
                    {isCurrent && <span className="ml-2 text-xs font-normal text-accent">minggu ini</span>}
                  </span>
                  <span className="block text-xs text-muted">{formatPeriod(period.start, period.end)}</span>
                </span>
                {report?.share_token && (
                  <span title="Dibagikan lewat link" className="text-muted">
                    <Link2 className="size-4" />
                  </span>
                )}
                <span
                  className={cn(
                    "chip",
                    !report
                      ? "bg-transparent text-muted"
                      : report.status === "sent"
                        ? "chip-tone tone-good"
                        : "chip-tone tone-warn",
                  )}
                >
                  {report ? STATUS_LABELS[report.status] : isCurrent || week < currentWeek ? "Belum dibuat" : "—"}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted" />
              </Link>
            </li>
          );
        })}
      </ol>
    </>
  );
}
