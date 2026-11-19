import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ArrowLeft } from "lucide-react";
import { ReportDocument } from "@/components/report-document";
import { ReportToolbar } from "@/components/report-toolbar";
import { SectionMark } from "@/components/section-mark";
import { requireUser } from "@/lib/auth";
import { getOrigin } from "@/lib/origin";
import { getProfile } from "@/lib/queries";
import { reportTitle, reportToChatText, STATUS_LABELS, weekLabel } from "@/lib/report-template";
import type { WeeklyReport } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

const loadReport = cache(async (id: string) => {
  const { supabase } = await requireUser();
  const [{ data: report }, profile] = await Promise.all([
    supabase.from("weekly_reports").select("*").eq("id", id).maybeSingle<WeeklyReport>(),
    getProfile(supabase),
  ]);
  return { report, profile };
});

// The page title doubles as the default file name when saving as PDF.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { report, profile } = await loadReport((await params).id);
  return { title: report ? { absolute: reportTitle(report, profile) } : "Laporan" };
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ report, profile }, origin] = await Promise.all([loadReport(id), getOrigin()]);
  if (!report) notFound();

  return (
    <div className="mx-auto max-w-[210mm]">
      <div className="mb-5 flex items-center justify-between gap-2 print:hidden">
        <SectionMark>
          <Link href="/reports" className="inline-flex items-center gap-1 hover:text-text">
            <ArrowLeft className="size-3.5" /> Semua laporan
          </Link>
        </SectionMark>
        <span
          className={cn(
            "chip",
            report.status === "sent"
              ? "chip-tone tone-good"
              : "chip-tone tone-warn",
          )}
        >
          {STATUS_LABELS[report.status]}
          {report.status === "sent" && report.sent_at && ` · ${formatDate(report.sent_at, { withYear: false })}`}
        </span>
      </div>

      <ReportToolbar
        reportId={report.id}
        status={report.status}
        shareToken={report.share_token ?? null}
        origin={origin}
        chatText={reportToChatText(report, profile)}
        weekLabel={weekLabel(report.week_number)}
      />

      <ReportDocument report={report} profile={profile} />
    </div>
  );
}
