import { requireUser } from "@/lib/auth";
import { buildReportDocx, docxResponse } from "@/lib/report-docx";
import { getProfile } from "@/lib/queries";
import { reportFileName } from "@/lib/report-template";
import type { WeeklyReport } from "@/lib/types";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireUser();
  const { id } = await params;

  const [{ data: report }, profile] = await Promise.all([
    supabase.from("weekly_reports").select("*").eq("id", id).maybeSingle<WeeklyReport>(),
    getProfile(supabase),
  ]);
  if (!report) return new Response("Laporan tidak ditemukan.", { status: 404 });

  return docxResponse(await buildReportDocx(report, profile), reportFileName(report, profile));
}
