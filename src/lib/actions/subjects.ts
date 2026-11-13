"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "../auth";
import type { ActionResult } from "../types";
import { asSubjectColor, dbError, optStr, str } from "./form";

function readSubject(fd: FormData) {
  return {
    title: str(fd, "title"),
    description: optStr(fd, "description"),
    color: asSubjectColor(fd.get("color")),
  };
}

export async function createSubject(formData: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const subject = readSubject(formData);
  if (!subject.title) return { error: "Nama subjek wajib diisi." };

  const { data, error } = await supabase.from("subjects").insert(subject).select("id").single();
  if (error) return dbError(error);

  revalidatePath("/", "layout");
  redirect(`/subjects/${data.id}`);
}

export async function updateSubject(id: string, formData: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const subject = readSubject(formData);
  if (!subject.title) return { error: "Nama subjek wajib diisi." };

  const { error } = await supabase.from("subjects").update(subject).eq("id", id);
  if (error) return dbError(error);

  revalidatePath("/", "layout");
}

export async function deleteSubject(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("subjects").delete().eq("id", id);
  if (error) return dbError(error);

  revalidatePath("/", "layout");
  redirect("/subjects");
}
