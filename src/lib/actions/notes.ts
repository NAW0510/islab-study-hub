"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "../auth";
import type { ActionResult } from "../types";
import { parseTags, todayISO } from "../utils";
import { dbError, optDate, optStr, str } from "./form";
import { resolveSubjectAndTopic } from "./refs";

export async function saveNote(id: string | null, formData: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();

  const title = str(formData, "title");
  if (!title) return { error: "Judul catatan wajib diisi." };

  const refs = await resolveSubjectAndTopic(
    supabase,
    optStr(formData, "subject_id"),
    optStr(formData, "syllabus_item_id"),
  );

  const note = {
    title,
    content: str(formData, "content"),
    tags: parseTags(str(formData, "tags")),
    learned_on: optDate(formData, "learned_on") ?? todayISO(),
    ...refs,
  };

  let noteId = id;
  if (id) {
    const { error } = await supabase.from("notes").update(note).eq("id", id);
    if (error) return dbError(error);
  } else {
    const { data, error } = await supabase.from("notes").insert(note).select("id").single();
    if (error) return dbError(error);
    noteId = data.id;
  }

  revalidatePath("/", "layout");
  redirect(`/notes/${noteId}`);
}

export async function deleteNote(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("notes").delete().eq("id", id);
  if (error) return dbError(error);

  revalidatePath("/", "layout");
  redirect("/notes");
}
