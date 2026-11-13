import type { Metadata } from "next";
import { NoteForm } from "@/components/note-form";
import { PageHeader } from "@/components/ui";
import { saveNote } from "@/lib/actions/notes";
import { requireUser } from "@/lib/auth";
import { getSubjectsAndTopics } from "@/lib/queries";

export const metadata: Metadata = { title: "Catatan baru" };

export default async function NewNotePage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; topic?: string }>;
}) {
  const { supabase } = await requireUser();
  const { subject, topic } = await searchParams;
  const { subjects, topics } = await getSubjectsAndTopics(supabase);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Catatan baru" />
      <NoteForm
        subjects={subjects}
        topics={topics}
        defaultSubjectId={subject}
        defaultTopicId={topic}
        action={saveNote.bind(null, null)}
        cancelHref={subject ? `/subjects/${subject}?tab=catatan` : "/notes"}
      />
    </div>
  );
}
