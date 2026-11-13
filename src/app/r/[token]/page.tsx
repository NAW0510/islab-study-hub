import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { ReportDocument } from "@/components/report-document";
import { ExportButtons } from "@/components/report-toolbar";
import { reportTitle } from "@/lib/report-template";
import { getSharedReport } from "@/lib/shared-report";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const shared = await getSharedReport((await params).token);
  return {
    title: shared ? { absolute: reportTitle(shared.report, shared.profile) } : "Laporan tidak ditemukan",
    robots: { index: false, follow: false },
  };
}

export default async function SharedReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const shared = await getSharedReport(token);
  if (!shared) notFound();

  return (
    <div className="min-h-dvh px-4 py-6 sm:py-10 print:p-0">
      <div className="mx-auto mb-6 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 print:hidden">
        <span className="flex items-center gap-2 text-sm text-muted">
          <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-accent-fg">
            <GraduationCap className="size-4" />
          </span>
          Laporan dibagikan lewat IS Lab Study Hub
        </span>
        <div className="flex gap-2">
          <ExportButtons docxHref={`/r/${token}/docx`} />
        </div>
      </div>
      <ReportDocument report={shared.report} profile={shared.profile} />
    </div>
  );
}
