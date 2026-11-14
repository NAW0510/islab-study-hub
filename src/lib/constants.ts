import type { ResourceType, Status, SubjectColor } from "./types";

export const APP_NAME = "IS Lab Study Hub";

export const STATUSES: Status[] = ["not_started", "in_progress", "completed"];

/** `badge` goes with the `chip` class: a soft tint, a dot in the signal colour, ink text. */
export const STATUS_META: Record<Status, { label: string; badge: string }> = {
  not_started: { label: "Belum mulai", badge: "chip-tone tone-none" },
  in_progress: { label: "Sedang dipelajari", badge: "chip-tone tone-warn" },
  completed: { label: "Selesai", badge: "chip-tone tone-good" },
};

export const RESOURCE_TYPES: ResourceType[] = ["youtube", "document", "article", "course", "other"];

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  youtube: "YouTube",
  document: "Dokumen",
  article: "Artikel",
  course: "Kursus",
  other: "Lainnya",
};

/**
 * Subject colours map onto the categorical palette in globals.css (`--domain-*`).
 * The keys are what the database stores and never change. Class names are
 * written out in full so Tailwind can see them at build time.
 *   dot / bar → solid colour for marks
 *   soft      → goes with the `chip` class (tint + dot + ink text)
 */
export const SUBJECT_COLORS: Record<SubjectColor, { label: string; dot: string; soft: string; bar: string }> = {
  teal: { label: "Toska", dot: "bg-domain-3", soft: "chip-tone tone-domain-3", bar: "bg-domain-3" },
  blue: { label: "Biru", dot: "bg-domain-1", soft: "chip-tone tone-domain-1", bar: "bg-domain-1" },
  violet: { label: "Ungu", dot: "bg-domain-7", soft: "chip-tone tone-domain-7", bar: "bg-domain-7" },
  rose: { label: "Merah muda", dot: "bg-domain-5", soft: "chip-tone tone-domain-5", bar: "bg-domain-5" },
  amber: { label: "Kuning", dot: "bg-domain-4", soft: "chip-tone tone-domain-4", bar: "bg-domain-4" },
  green: { label: "Hijau", dot: "bg-domain-6", soft: "chip-tone tone-domain-6", bar: "bg-domain-6" },
  slate: { label: "Abu-abu", dot: "bg-domain-none", soft: "chip-tone tone-none", bar: "bg-domain-none" },
};

export const SUBJECT_COLOR_KEYS = Object.keys(SUBJECT_COLORS) as SubjectColor[];

/** Private Supabase Storage bucket for uploaded documents (see supabase/migrations). */
export const DOCUMENTS_BUCKET = "documents";
