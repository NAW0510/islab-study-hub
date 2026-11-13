import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportForm } from "@/components/report-form";
import { PageHeader } from "@/components/ui";
import { saveReport } from "@/lib/actions/reports";
import { requireUser } from "@/lib/auth";
import { getProfile } from "@/lib/queries";
import { DEFAULT_PROGRAM_START, weekLabel } from "@/lib/report-template";
import type { WeeklyReport } from "@/lib/types";

export const metadata: Metadata = { title: "Edit laporan" };

export default async function EditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireUser();
  const { id } = await params;

  const [{ data: report }, profile, existingRes] = await Promise.all([
    supabase.from("weekly_reports").select("*").eq("id", id).maybeSingle<WeeklyReport>(),
    getProfile(supabase),
    supabase.from("weekly_reports").select("week_number").neq("id", id),
  ]);
  if (!report) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Edit laporan ${weekLabel(report.week_number)}`} />
      <ReportForm
        report={report}
        programStart={profile?.program_start ?? DEFAULT_PROGRAM_START}
        initialWeek={report.week_number}
        takenWeeks={((existingRes.data ?? []) as { week_number: number }[]).map((r) => r.week_number)}
        action={saveReport.bind(null, report.id)}
        cancelHref={`/reports/${report.id}`}
      />
    </div>
  );
}
