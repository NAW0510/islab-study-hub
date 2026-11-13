import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NoteForm } from "@/components/note-form";
import { PageHeader } from "@/components/ui";
import { saveNote } from "@/lib/actions/notes";
import { requireUser } from "@/lib/auth";
import { getSubjectsAndTopics } from "@/lib/queries";
import type { Note } from "@/lib/types";

export const metadata: Metadata = { title: "Edit catatan" };

export default async function EditNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireUser();
  const { id } = await params;

  const [{ data: note }, { subjects, topics }] = await Promise.all([
    supabase.from("notes").select("*").eq("id", id).maybeSingle<Note>(),
    getSubjectsAndTopics(supabase),
  ]);
  if (!note) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Edit catatan" />
      <NoteForm
        note={note}
        subjects={subjects}
        topics={topics}
        action={saveNote.bind(null, note.id)}
        cancelHref={`/notes/${note.id}`}
      />
    </div>
  );
}
