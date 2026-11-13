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

export type ReportStatus = "draft" | "sent";

export interface Profile {
  user_id: string;
  full_name: string | null;
  group_number: string | null;
  group_name: string | null;
  mentor_name: string | null;
  /** First day of "Week 1" of the intern programme (YYYY-MM-DD). */
  program_start: string;
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
