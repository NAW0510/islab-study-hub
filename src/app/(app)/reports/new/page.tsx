import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ReportForm } from "@/components/report-form";
import { PageHeader } from "@/components/ui";
import { saveReport } from "@/lib/actions/reports";
import { requireUser } from "@/lib/auth";
import { getProfile } from "@/lib/queries";
import { DEFAULT_PROGRAM_START, weekLabel, weekNumberFor } from "@/lib/report-template";
import { todayISO } from "@/lib/utils";

export const metadata: Metadata = { title: "Laporan baru" };

export default async function NewReportPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { supabase } = await requireUser();
  const { week: weekParam } = await searchParams;

  const [profile, existingRes] = await Promise.all([
    getProfile(supabase),
    supabase.from("weekly_reports").select("id, week_number"),
  ]);
  const existing = (existingRes.data ?? []) as { id: string; week_number: number }[];
  const programStart = profile?.program_start ?? DEFAULT_PROGRAM_START;

  const parsed = Number(weekParam);
  const week = Number.isInteger(parsed) && parsed >= 0 && parsed <= 52 ? parsed : weekNumberFor(programStart, todayISO());

  // One report per week: if it already exists, edit that one instead.
  const already = existing.find((r) => r.week_number === week);
  if (already) redirect(`/reports/${already.id}/edit`);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Laporan ${weekLabel(week)}`} description="Isi sesuai template Weekly Progress dari guidebook." />
      <ReportForm
        programStart={programStart}
        initialWeek={week}
        takenWeeks={existing.map((r) => r.week_number)}
        action={saveReport.bind(null, null)}
        cancelHref="/reports"
      />
    </div>
  );
}
