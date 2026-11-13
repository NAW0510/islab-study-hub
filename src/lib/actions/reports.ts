"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "../auth";
import { addDays, DEFAULT_PROGRAM_START, LEARNING_SECTIONS, PROJECT_SECTIONS } from "../report-template";
import type { ActionResult, ReportStatus } from "../types";
import { TIMEZONE } from "../utils";
import { dbError, optDate, optStr, str } from "./form";

const REPORT_FIELDS = [...LEARNING_SECTIONS, ...PROJECT_SECTIONS].map((s) => s.key);

export async function saveReport(id: string | null, formData: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();

  const week = Number(str(formData, "week_number"));
  const periodStart = optDate(formData, "period_start");
  const periodEnd = optDate(formData, "period_end");
  if (!Number.isInteger(week) || week < 0 || week > 52) return { error: "Nomor minggu tidak valid." };
  if (!periodStart || !periodEnd) return { error: "Periode minggu wajib diisi." };
  if (periodEnd < periodStart) return { error: "Tanggal akhir periode harus setelah tanggal mulai." };

  const report: Record<string, string | number> = {
    week_number: week,
    period_start: periodStart,
    period_end: periodEnd,
    links: str(formData, "links"),
  };
  for (const key of REPORT_FIELDS) report[key] = str(formData, key);

  let reportId = id;
  if (id) {
    const { error } = await supabase.from("weekly_reports").update(report).eq("id", id);
    if (error) return error.code === "23505" ? { error: `Laporan untuk minggu ${week} sudah ada.` } : dbError(error);
  } else {
    const { data, error } = await supabase.from("weekly_reports").insert(report).select("id").single();
    if (error) return error.code === "23505" ? { error: `Laporan untuk minggu ${week} sudah ada.` } : dbError(error);
    reportId = data.id;
  }

  revalidatePath("/", "layout");
  redirect(`/reports/${reportId}`);
}

export async function deleteReport(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("weekly_reports").delete().eq("id", id);
  if (error) return dbError(error);

  revalidatePath("/", "layout");
  redirect("/reports");
}

export async function setReportStatus(id: string, status: ReportStatus): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("weekly_reports")
    .update({ status, sent_at: status === "sent" ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return dbError(error);

  revalidatePath("/", "layout");
}

/** Creates (or returns the existing) secret token for the public read-only link. */
export async function enableShare(id: string): Promise<{ token?: string; error?: string }> {
  const { supabase } = await requireUser();
  const { data: existing } = await supabase.from("weekly_reports").select("share_token").eq("id", id).single();
  if (existing?.share_token) return { token: existing.share_token };

  const token = randomBytes(18).toString("base64url"); // 24 chars, 144 bits
  const { error } = await supabase.from("weekly_reports").update({ share_token: token }).eq("id", id);
  if (error) return { error: dbError(error).error };

  revalidatePath("/", "layout");
  return { token };
}

/** Revokes the public link; an old link stops working immediately. */
export async function disableShare(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("weekly_reports").update({ share_token: null }).eq("id", id);
  if (error) return dbError(error);

  revalidatePath("/", "layout");
}

export async function saveProfile(formData: FormData): Promise<ActionResult> {
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("profiles").upsert({
    user_id: userId,
    full_name: optStr(formData, "full_name"),
    group_number: optStr(formData, "group_number"),
    group_name: optStr(formData, "group_name"),
    mentor_name: optStr(formData, "mentor_name"),
    program_start: optDate(formData, "program_start") ?? DEFAULT_PROGRAM_START,
  });
  if (error) return dbError(error);

  revalidatePath("/", "layout");
}

/**
 * First line of real prose in a note (skips headings, code, tables and display
 * math), trimmed at a word boundary. Inline Markdown and `$…$` formulas are kept
 * intact so they still render in the report.
 */
function firstSentence(md: string, max = 160) {
  let inFence = false;
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !line || line.startsWith("#") || line.startsWith("|") || line.startsWith("$$") || line.startsWith(">")) {
      continue;
    }
    const text = line.replace(/^([-*+]|\d+[.)])\s+/, "");
    if (text.length <= max) return text;
    let cut = text.slice(0, max).replace(/\s+\S*$/, "");
    if ((cut.match(/\$/g) ?? []).length % 2 === 1) cut = cut.slice(0, cut.lastIndexOf("$")).trimEnd();
    return `${cut}…`;
  }
  return "";
}

/** "+07:00" style UTC offset of the app timezone on a given day. */
function tzOffset(isoDate: string) {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, timeZoneName: "longOffset" })
    .formatToParts(new Date(`${isoDate}T12:00:00Z`))
    .find((p) => p.type === "timeZoneName")?.value;
  const match = part?.match(/GMT([+-]\d{2}:\d{2})/);
  return match ? match[1] : "+00:00";
}

/**
 * Drafts "What did you work on" and "What did you learn" from what was recorded
 * in the app during the given week: finished/active syllabus topics, resources
 * and notes. The user edits the draft before sending it.
 */
export async function suggestReportContent(
  periodStart: string,
  periodEnd: string,
): Promise<{ workedOn: string; learned: string; error?: string }> {
  const { supabase } = await requireUser();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
    return { workedOn: "", learned: "", error: "Periode tidak valid." };
  }
  const from = `${periodStart}T00:00:00${tzOffset(periodStart)}`;
  const to = `${addDays(periodEnd, 1)}T00:00:00${tzOffset(periodEnd)}`;

  const [completedRes, activeRes, resourcesRes, notesRes] = await Promise.all([
    supabase
      .from("syllabus_items")
      .select("title, subject:subjects(title)")
      .eq("status", "completed")
      .gte("completed_at", from)
      .lt("completed_at", to)
      .order("completed_at"),
    supabase
      .from("syllabus_items")
      .select("title, subject:subjects(title)")
      .eq("status", "in_progress")
      .gte("updated_at", from)
      .lt("updated_at", to),
    supabase
      .from("resources")
      .select("title, url, status, type")
      .in("status", ["completed", "in_progress"])
      .gte("updated_at", from)
      .lt("updated_at", to)
      .order("updated_at"),
    supabase
      .from("notes")
      .select("title, content, tags")
      .gte("learned_on", periodStart)
      .lte("learned_on", periodEnd)
      .order("learned_on"),
  ]);

  type TopicRow = { title: string; subject: { title: string } | null };
  const topic = (t: TopicRow) => `**${t.title}**${t.subject ? ` (${t.subject.title})` : ""}`;

  const worked: string[] = [];
  for (const t of (completedRes.data ?? []) as unknown as TopicRow[]) worked.push(`- Menyelesaikan topik ${topic(t)}`);
  for (const t of (activeRes.data ?? []) as unknown as TopicRow[]) worked.push(`- Sedang mempelajari ${topic(t)}`);
  for (const r of (resourcesRes.data ?? []) as { title: string; url: string | null; status: string; type: string }[]) {
    const verb = r.type === "youtube" ? "Menonton" : r.type === "course" ? "Mengikuti" : "Membaca";
    const title = r.url ? `[${r.title}](${r.url})` : r.title;
    worked.push(`- ${verb} ${title}${r.status === "in_progress" ? " (belum selesai)" : ""}`);
  }

  const learned = ((notesRes.data ?? []) as { title: string; content: string; tags: string[] }[]).map((n) => {
    const summary = firstSentence(n.content);
    return `- **${n.title}**${summary ? ` — ${summary}` : ""}`;
  });

  return { workedOn: worked.join("\n"), learned: learned.join("\n") };
}
