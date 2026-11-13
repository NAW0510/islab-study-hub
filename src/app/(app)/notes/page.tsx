import type { Metadata } from "next";
import { NoteBrowser } from "@/components/note-browser";
import { NoteCard } from "@/components/note-card";
import { requireUser } from "@/lib/auth";
import { NOTE_SELECT } from "@/lib/queries";
import type { NoteWithRefs, SubjectRef } from "@/lib/types";
import { normalizeSearch } from "@/lib/utils";

export const metadata: Metadata = { title: "Catatan" };

/** Cap per note so a few very long notes can't bloat the page payload. */
const SEARCH_TEXT_LIMIT = 20_000;

function one(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
}

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase } = await requireUser();
  const sp = await searchParams;

  // Load everything once; search and filters run instantly in the browser.
  const [notesRes, subjectsRes] = await Promise.all([
    supabase
      .from("notes")
      .select(NOTE_SELECT)
      .order("learned_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("subjects").select("id, title, color").order("title"),
  ]);
  const notes = (notesRes.data ?? []) as NoteWithRefs[];
  const initial = { q: one(sp.q), subject: one(sp.subject), topic: one(sp.topic), tag: one(sp.tag) };

  return (
    <NoteBrowser
      // Remount when a link (e.g. a tag on a card) navigates here with new filters.
      key={JSON.stringify(initial)}
      subjects={(subjectsRes.data ?? []) as SubjectRef[]}
      initial={initial}
      items={notes.map((n) => ({
        id: n.id,
        subjectId: n.subject_id,
        topicId: n.syllabus_item_id,
        topicTitle: n.topic?.title ?? null,
        tags: n.tags,
        haystack: normalizeSearch(
          `${n.title} ${n.tags.join(" ")} ${n.topic?.title ?? ""} ${n.content.slice(0, SEARCH_TEXT_LIMIT)}`,
        ),
        card: <NoteCard note={n} />,
      }))}
    />
  );
}
