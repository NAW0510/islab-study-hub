"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "../auth";
import type { ActionResult, Status } from "../types";
import { DOCUMENTS_BUCKET } from "../constants";
import { guessResourceType, hostnameOf, isYouTubeUrl, safeNextPath } from "../utils";
import { asResourceType, asStatus, dbError, isHttpUrl, optStr, str } from "./form";
import { resolveSubjectAndTopic } from "./refs";

async function fetchYouTubeTitle(url: string) {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { title?: string };
    return json.title?.slice(0, 300) ?? null;
  } catch {
    return null;
  }
}

/**
 * Creates or updates a resource. Uploaded files go straight from the browser
 * to Supabase Storage; this action only receives the resulting `storage_path`.
 */
export async function saveResource(id: string | null, formData: FormData): Promise<ActionResult> {
  const { supabase, userId } = await requireUser();

  const url = optStr(formData, "url");
  const storagePath = optStr(formData, "storage_path");

  if (!url && !storagePath) return { error: "Isi link atau upload sebuah file." };
  if (url && !isHttpUrl(url)) return { error: "Link harus diawali http:// atau https://" };
  if (storagePath && !storagePath.startsWith(`${userId}/`)) return { error: "Path file tidak valid." };

  let title = str(formData, "title");
  if (!title && url) {
    title = (isYouTubeUrl(url) && (await fetchYouTubeTitle(url))) || hostnameOf(url);
  }
  if (!title && storagePath) title = storagePath.split("/").pop()?.replace(/^[\w-]{36}-/, "") ?? "";
  if (!title) return { error: "Judul wajib diisi." };

  const typeInput = str(formData, "type");
  const refs = await resolveSubjectAndTopic(
    supabase,
    optStr(formData, "subject_id"),
    optStr(formData, "syllabus_item_id"),
  );

  const resource = {
    title,
    url: storagePath ? null : url,
    storage_path: storagePath,
    type: typeInput ? asResourceType(typeInput) : url ? guessResourceType(url) : "document",
    status: asStatus(formData.get("status")),
    notes: optStr(formData, "notes"),
    ...refs,
  };

  if (id) {
    const { data: previous } = await supabase
      .from("resources")
      .select("storage_path")
      .eq("id", id)
      .single();

    const { error } = await supabase.from("resources").update(resource).eq("id", id);
    if (error) return dbError(error);

    // Replaced or removed the uploaded file → clean up the old object.
    if (previous?.storage_path && previous.storage_path !== resource.storage_path) {
      await supabase.storage.from(DOCUMENTS_BUCKET).remove([previous.storage_path]);
    }
  } else {
    const { error } = await supabase.from("resources").insert(resource);
    if (error) return dbError(error);
  }

  revalidatePath("/", "layout");
  redirect(safeNextPath(formData.get("return_to") || "/resources"));
}

export async function setResourceStatus(id: string, status: Status): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("resources")
    .update({ status: asStatus(status) })
    .eq("id", id);
  if (error) return dbError(error);

  revalidatePath("/", "layout");
}

export async function deleteResource(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();

  const { data: resource } = await supabase
    .from("resources")
    .select("storage_path")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("resources").delete().eq("id", id);
  if (error) return dbError(error);

  if (resource?.storage_path) {
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([resource.storage_path]);
  }

  revalidatePath("/", "layout");
}

/** Removes a file uploaded by the browser when saving the resource failed. */
export async function discardUpload(storagePath: string) {
  const { supabase, userId } = await requireUser();
  if (!storagePath.startsWith(`${userId}/`)) return;
  await supabase.storage.from(DOCUMENTS_BUCKET).remove([storagePath]);
}
