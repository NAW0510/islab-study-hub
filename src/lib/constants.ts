import type { ResourceType, Status, SubjectColor } from "./types";

export const APP_NAME = "IS Lab Study Hub";

export const STATUSES: Status[] = ["not_started", "in_progress", "completed"];

export const STATUS_META: Record<Status, { label: string; badge: string }> = {
  not_started: {
    label: "Belum mulai",
    badge: "bg-surface-2 text-muted",
  },
  in_progress: {
    label: "Sedang dipelajari",
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300",
  },
  completed: {
    label: "Selesai",
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300",
  },
};

export const RESOURCE_TYPES: ResourceType[] = ["youtube", "document", "article", "course", "other"];

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  youtube: "YouTube",
  document: "Dokumen",
  article: "Artikel",
  course: "Kursus",
  other: "Lainnya",
};

// Full class names so Tailwind can see them at build time.
export const SUBJECT_COLORS: Record<
  SubjectColor,
  { label: string; dot: string; soft: string; bar: string }
> = {
  teal: {
    label: "Teal",
    dot: "bg-teal-500",
    soft: "bg-teal-50 text-teal-800 dark:bg-teal-400/10 dark:text-teal-300",
    bar: "bg-teal-500",
  },
  blue: {
    label: "Biru",
    dot: "bg-blue-500",
    soft: "bg-blue-50 text-blue-800 dark:bg-blue-400/10 dark:text-blue-300",
    bar: "bg-blue-500",
  },
  violet: {
    label: "Ungu",
    dot: "bg-violet-500",
    soft: "bg-violet-50 text-violet-800 dark:bg-violet-400/10 dark:text-violet-300",
    bar: "bg-violet-500",
  },
  rose: {
    label: "Merah muda",
    dot: "bg-rose-500",
    soft: "bg-rose-50 text-rose-800 dark:bg-rose-400/10 dark:text-rose-300",
    bar: "bg-rose-500",
  },
  amber: {
    label: "Kuning",
    dot: "bg-amber-500",
    soft: "bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300",
    bar: "bg-amber-500",
  },
  green: {
    label: "Hijau",
    dot: "bg-green-500",
    soft: "bg-green-50 text-green-800 dark:bg-green-400/10 dark:text-green-300",
    bar: "bg-green-500",
  },
  slate: {
    label: "Abu-abu",
    dot: "bg-slate-500",
    soft: "bg-slate-100 text-slate-700 dark:bg-slate-400/10 dark:text-slate-300",
    bar: "bg-slate-500",
  },
};

export const SUBJECT_COLOR_KEYS = Object.keys(SUBJECT_COLORS) as SubjectColor[];

/** Private Supabase Storage bucket for uploaded documents (see supabase/schema.sql). */
export const DOCUMENTS_BUCKET = "documents";
