"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "../auth";
import type { ActionResult, Status } from "../types";
import { asStatus, dbError, optDate, optStr, str } from "./form";

/** Strips list markers like "1.", "1)", "-", "*", "[ ]" from pasted syllabus lines. */
function cleanLine(line: string) {
  return line
    .trim()
    .replace(/^(?:[-*•]\s+|\d+[.)]\s+|\[[ xX]?\]\s+)+/, "")
    .trim();
}

/**
 * Adds one topic (title + description) or many at once (`lines`, one topic
 * per line — handy for pasting a whole syllabus).
 */
export async function addSyllabusItems(subjectId: string, formData: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();

  const lines = str(formData, "lines");
  const items = lines
    ? lines.split(/\r?\n/).map(cleanLine).filter(Boolean).map((title) => ({ title, description: null }))
    : [{ title: str(formData, "title"), description: optStr(formData, "description") }];

  if (items.length === 0 || !items[0].title) return { error: "Judul topik wajib diisi." };
  if (items.length > 200) return { error: "Maksimal 200 topik sekaligus." };

  const { data: last } = await supabase
    .from("syllabus_items")
    .select("position")
    .eq("subject_id", subjectId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const start = (last?.position ?? -1) + 1;

  const { error } = await supabase.from("syllabus_items").insert(
    items.map((item, i) => ({
      ...item,
      subject_id: subjectId,
      position: start + i,
      target_date: lines ? null : optDate(formData, "target_date"),
    })),
  );
  if (error) return dbError(error);

  revalidatePath("/", "layout");
}

export async function updateSyllabusItem(id: string, formData: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const title = str(formData, "title");
  if (!title) return { error: "Judul topik wajib diisi." };

  const { error } = await supabase
    .from("syllabus_items")
    .update({
      title,
      description: optStr(formData, "description"),
      target_date: optDate(formData, "target_date"),
    })
    .eq("id", id);
  if (error) return dbError(error);

  revalidatePath("/", "layout");
}

export async function setSyllabusStatus(id: string, status: Status): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("syllabus_items")
    .update({ status: asStatus(status) })
    .eq("id", id);
  if (error) return dbError(error);

  revalidatePath("/", "layout");
}

export async function moveSyllabusItem(
  id: string,
  subjectId: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  const { supabase } = await requireUser();

  // RLS limits this to the user's own rows; an id outside the subject is simply not found below.
  const { data: siblings, error } = await supabase
    .from("syllabus_items")
    .select("id, position")
    .eq("subject_id", subjectId)
    .order("position")
    .order("created_at");
  if (error || !siblings) return dbError(error ?? { message: "Gagal memuat silabus." });

  const order = siblings.map((s) => s.id);
  const from = order.indexOf(id);
  if (from < 0) return { error: "Topik tidak ditemukan." };
  const to = direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= order.length) return;
  [order[from], order[to]] = [order[to], order[from]];

  // Rewrite positions as 0..n-1 so duplicates from earlier inserts get normalised too.
  const updates = order
    .map((itemId, position) => ({ itemId, position }))
    .filter(({ itemId, position }) => siblings.find((s) => s.id === itemId)?.position !== position);

  const results = await Promise.all(
    updates.map(({ itemId, position }) =>
      supabase.from("syllabus_items").update({ position }).eq("id", itemId),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return dbError(failed.error);

  revalidatePath("/", "layout");
}

export async function deleteSyllabusItem(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("syllabus_items").delete().eq("id", id);
  if (error) return dbError(error);

  revalidatePath("/", "layout");
}
