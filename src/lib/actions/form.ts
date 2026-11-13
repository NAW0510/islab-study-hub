import type { PostgrestError } from "@supabase/supabase-js";
import { RESOURCE_TYPES, STATUSES, SUBJECT_COLOR_KEYS } from "../constants";
import type { ResourceType, Status, SubjectColor } from "../types";

/** Trimmed string field, "" when missing. */
export function str(fd: FormData, name: string) {
  const value = fd.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** Trimmed string field, null when empty. */
export function optStr(fd: FormData, name: string) {
  return str(fd, name) || null;
}

export function optDate(fd: FormData, name: string) {
  const value = str(fd, name);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function asStatus(value: unknown): Status {
  return STATUSES.includes(value as Status) ? (value as Status) : "not_started";
}

export function asResourceType(value: unknown): ResourceType {
  return RESOURCE_TYPES.includes(value as ResourceType) ? (value as ResourceType) : "other";
}

export function asSubjectColor(value: unknown): SubjectColor {
  return SUBJECT_COLOR_KEYS.includes(value as SubjectColor) ? (value as SubjectColor) : "teal";
}

export function isHttpUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function dbError(error: PostgrestError | { message: string }) {
  return { error: `Gagal menyimpan ke database: ${error.message}` };
}
