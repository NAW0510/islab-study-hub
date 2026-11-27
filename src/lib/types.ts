// Mirrors supabase/schema.sql. Regenerate-able later with `supabase gen types`.

export type Status = "not_started" | "in_progress" | "completed";
export type ResourceType = "youtube" | "document" | "article" | "course" | "other";
export type SubjectColor = "teal" | "blue" | "violet" | "rose" | "amber" | "green" | "slate";

export interface Subject {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  color: SubjectColor;
  created_at: string;
  updated_at: string;
}

export interface SyllabusItem {
  id: string;
  user_id: string;
  subject_id: string;
  title: string;
  description: string | null;
  position: number;
  status: Status;
  target_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: string;
  user_id: string;
  subject_id: string | null;
  syllabus_item_id: string | null;
  title: string;
  content: string;
  tags: string[];
  learned_on: string;
  created_at: string;
  updated_at: string;
}

export interface Resource {
  id: string;
  user_id: string;
  subject_id: string | null;
  syllabus_item_id: string | null;
  title: string;
  type: ResourceType;
  url: string | null;
  storage_path: string | null;
  status: Status;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type SubjectRef = Pick<Subject, "id" | "title" | "color">;
export type TopicRef = Pick<SyllabusItem, "id" | "title" | "subject_id">;

export type NoteWithRefs = Note & {
  subject: SubjectRef | null;
  topic: Pick<SyllabusItem, "id" | "title"> | null;
};

export type ResourceWithRefs = Resource & {
  subject: SubjectRef | null;
  topic: Pick<SyllabusItem, "id" | "title"> | null;
};

/** Server actions return nothing on success (or redirect) and `{ error }` on failure. */
export type ActionResult = { error: string } | void;

// ── Kosakata (mirrors the vocab migration) ────────────────────────────────

export type DomainSource = "pending" | "auto" | "confirmed" | "manual";

export interface VocabDomain {
  id: string;
  name: string;
  description: string;
  /** Palette token: "domain-1" … "domain-10" or "domain-none". */
  color: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface VocabTerm {
  id: string;
  term: string;
  aliases: string[];
  /** Markdown + LaTeX. */
  definition: string;
  learned_on: string;
  /** The primary domain: colour, map position, cover, and the one classification may change. */
  domain_id: string | null;
  domain_source: DomainSource;
  /** Top classification scores: cosine similarities, never percentages. */
  domain_scores: { domain_id: string; score: number }[] | null;
  /**
   * Extra domains the user attached (one term, many domains: "Allah" in
   * Islam, Katolik and Kristen). Absent when a query did not embed them; read
   * them with extraDomainIds() (lib/vocab/format.ts).
   */
  extra_domains?: { domain_id: string; created_at: string }[] | null;
  subject_id: string | null;
  syllabus_item_id: string | null;
  note_id: string | null;
  /** Null while the term still waits for an embedding ("belum diproses"). */
  embedded_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Ruang Studi › Bahasa (mirrors the study_languages migration) ─────────────

export interface StudyLanguage {
  id: string;
  name: string;
  /** ISO 639 code (ja, en, ban), or null for a language of one's own. */
  code: string | null;
  /** ISO 3166-1 alpha-2 codes of the countries its words light up on the atlas. */
  countries: string[];
  /** Palette token: "domain-1" … "domain-10". */
  color: string;
  created_at: string;
  updated_at: string;
}

export interface StudyWord {
  id: string;
  language_id: string;
  word: string;
  /** How it reads: romaji, pinyin, a transliteration. */
  reading: string | null;
  /** Written by the user; never translated automatically. */
  meaning: string;
  example: string | null;
  notes: string | null;
  /** One country only (a regional word); null: every country of its language. */
  region: string | null;
  learned_on: string;
  created_at: string;
  updated_at: string;
}

export type ReportStatus = "draft" | "sent";

export interface Profile {
  user_id: string;
  full_name: string | null;
  group_number: string | null;
  group_name: string | null;
  mentor_name: string | null;
  /** First day of "Week 1" of the intern programme (YYYY-MM-DD). */
  program_start: string;
  /** How the brain map was last laid out (a `LayoutParams` object); null before the first layout. */
  vocab_layout_params?: unknown;
  vocab_layout_at?: string | null;
}

/** The identity shown on a report's header (also exposed on shared links). */
export type ReportProfile = Pick<Profile, "full_name" | "group_number" | "group_name" | "mentor_name">;

export interface WeeklyReport {
  id: string;
  week_number: number;
  period_start: string;
  period_end: string;
  learning_worked_on: string;
  learning_learned: string;
  learning_challenge: string;
  learning_next_target: string;
  project_done: string;
  project_decisions: string;
  project_next: string;
  project_obstacles: string;
  links: string;
  status: ReportStatus;
  sent_at: string | null;
  share_token?: string | null;
  created_at: string;
  updated_at: string;
}
