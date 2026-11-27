"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "../auth";
import { cleanCountries } from "../study/languages";
import type { ActionResult, StudyLanguage, StudyWord } from "../types";
import { todayISO } from "../utils";
import { asDomainColor } from "../vocab/seed-domains";
import { dbError, optDate, optStr, str } from "./form";

/**
 * Server Actions for the Ruang Studi's Bahasa: languages and their words.
 * Every write goes through RLS as the signed-in user. Meanings are the
 * user's own; nothing is translated automatically (spec §0).
 */

function studyDbError(error: { code?: string; message: string }, what: "bahasa" | "diksi"): { error: string } {
  if (error.code === "23505") return { error: what === "bahasa" ? "Bahasa dengan nama itu sudah ada." : "Diksi itu sudah ada di bahasa ini." };
  // Trigger and check messages are written for people (ownership, a language that still has words).
  if (error.code === "23503") return { error: error.message };
  if (error.code === "23514") {
    return { error: error.message.startsWith("Bahasa ini") ? error.message : "Ada isian yang tidak valid. Periksa lagi panjang teks dan kode negaranya." };
  }
  return dbError(error);
}

// ── Languages ──────────────────────────────────────────────────────────────

export type LanguageInput = { name: string; code?: string | null; countries: string[]; color: string };

function languageRow(input: LanguageInput): { error: string } | { name: string; code: string | null; countries: string[]; color: string } {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) return { error: "Nama bahasa wajib diisi." };
  if (name.length > 60) return { error: "Nama bahasa maksimal 60 karakter." };
  const code = input.code?.trim().toLowerCase() || null;
  if (code && !/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(code)) return { error: "Kode bahasa memakai ISO 639, mis. ja, en, atau ban." };
  const color = asDomainColor(input.color);
  return { name, code, countries: cleanCountries(input.countries), color: color === "domain-none" ? "domain-1" : color };
}

export type SaveLanguageResult = { error: string } | { language: StudyLanguage };

export async function createLanguage(input: LanguageInput): Promise<SaveLanguageResult> {
  const row = languageRow(input);
  if ("error" in row) return row;
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("study_languages").insert(row).select("*").single();
  if (error) return studyDbError(error, "bahasa");
  revalidatePath("/", "layout");
  return { language: data as StudyLanguage };
}

export async function updateLanguage(id: string, input: LanguageInput): Promise<SaveLanguageResult> {
  const row = languageRow(input);
  if ("error" in row) return row;
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("study_languages").update(row).eq("id", id).is("deleted_at", null).select("*").single();
  if (error) return studyDbError(error, "bahasa");
  revalidatePath("/", "layout");
  return { language: data as StudyLanguage };
}

/** Soft delete; the database refuses while the language still has words. */
export async function deleteLanguage(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("study_languages").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return studyDbError(error, "bahasa");
  revalidatePath("/", "layout");
}

// ── Words ──────────────────────────────────────────────────────────────────

function wordRow(formData: FormData): { error: string } | Omit<StudyWord, "id" | "created_at" | "updated_at"> {
  const languageId = str(formData, "language_id");
  if (!languageId) return { error: "Pilih bahasanya dulu." };
  const word = str(formData, "word").replace(/\s+/g, " ");
  if (!word) return { error: "Diksi wajib diisi." };
  if (word.length > 200) return { error: "Diksi maksimal 200 karakter." };
  const reading = optStr(formData, "reading");
  if (reading && reading.length > 200) return { error: "Cara baca maksimal 200 karakter." };
  const meaning = str(formData, "meaning");
  if (meaning.length > 2000) return { error: "Arti maksimal 2000 karakter." };
  const example = optStr(formData, "example");
  if (example && example.length > 2000) return { error: "Contoh kalimat maksimal 2000 karakter." };
  const notes = optStr(formData, "notes");
  if (notes && notes.length > 4000) return { error: "Catatan maksimal 4000 karakter." };
  const region = optStr(formData, "region")?.toUpperCase() ?? null;
  if (region && !/^[A-Z]{2}$/.test(region)) return { error: "Negara khas tidak dikenal." };
  return {
    language_id: languageId,
    word,
    reading,
    meaning,
    example,
    notes,
    region,
    learned_on: optDate(formData, "learned_on") ?? todayISO(),
  };
}

export type SaveWordResult = { error: string } | { word: StudyWord };

export async function createWord(formData: FormData): Promise<SaveWordResult> {
  const row = wordRow(formData);
  if ("error" in row) return row;
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("study_words").insert(row).select("*").single();
  if (error) return studyDbError(error, "diksi");
  revalidatePath("/", "layout");
  return { word: data as StudyWord };
}

export async function updateWord(id: string, formData: FormData): Promise<SaveWordResult> {
  const row = wordRow(formData);
  if ("error" in row) return row;
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("study_words").update(row).eq("id", id).is("deleted_at", null).select("*").single();
  if (error) return studyDbError(error, "diksi");
  revalidatePath("/", "layout");
  return { word: data as StudyWord };
}

export async function deleteWord(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("study_words").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return studyDbError(error, "diksi");
  revalidatePath("/", "layout");
}

/** Undo for deleteWord (the toast's "Urungkan"). */
export async function restoreWord(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("study_words").update({ deleted_at: null }).eq("id", id);
  if (error) return studyDbError(error, "diksi");
  revalidatePath("/", "layout");
}
