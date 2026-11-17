import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportDocument } from "@/components/report-document";
import { ExportButtons } from "@/components/report-toolbar";
import { BrandMark } from "@/components/shell/parts";
import { APP_NAME } from "@/lib/constants";
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
        <span className="flex items-center gap-2.5 text-sm text-muted">
          <BrandMark size="sm" />
          <span>
            Laporan dibagikan lewat <span className="font-display font-semibold tracking-tight text-text">{APP_NAME}</span>
          </span>
        </span>
        <div className="flex gap-2">
          <ExportButtons docxHref={`/r/${token}/docx`} />
        </div>
      </div>
      <ReportDocument report={shared.report} profile={shared.profile} />
    </div>
  );
}
