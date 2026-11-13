import { buildReportDocx, docxResponse } from "@/lib/report-docx";
import { reportFileName } from "@/lib/report-template";
import { getSharedReport } from "@/lib/shared-report";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const shared = await getSharedReport((await params).token);
  if (!shared) return new Response("Laporan tidak ditemukan atau link sudah dimatikan.", { status: 404 });

  return docxResponse(
    await buildReportDocx(shared.report, shared.profile),
    reportFileName(shared.report, shared.profile),
  );
}
