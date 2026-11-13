import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Pencil } from "lucide-react";
import { DeleteButton } from "@/components/action-buttons";
import { Markdown } from "@/components/markdown";
import { ResourceCard } from "@/components/resource-card";
import { SubjectChip, Tag } from "@/components/ui";
import { deleteNote } from "@/lib/actions/notes";
import { requireUser } from "@/lib/auth";
import { NOTE_SELECT, RESOURCE_SELECT } from "@/lib/queries";
import type { NoteWithRefs, ResourceWithRefs } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Catatan" };

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireUser();
  const { id } = await params;

  // One round trip: the note plus every resource linked to the same syllabus topic.
  const { data: note } = await supabase
    .from("notes")
    .select(`${NOTE_SELECT}, topic_resources:syllabus_items(resources(${RESOURCE_SELECT}))`)
    .eq("id", id)
    .maybeSingle<NoteWithRefs & { topic_resources: { resources: ResourceWithRefs[] } | null }>();
  if (!note) notFound();

  const resources = [...(note.topic_resources?.resources ?? [])].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );

  return (
    <article className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-2">
        <Link href="/notes" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
          <ArrowLeft className="size-3.5" /> Catatan
        </Link>
        <div className="flex items-center gap-1">
          <Link href={`/notes/${note.id}/edit`} className="btn btn-secondary btn-sm">
            <Pencil className="size-3.5" /> Edit
          </Link>
          <DeleteButton
            className="btn-sm"
            action={deleteNote.bind(null, note.id)}
            confirmText={`Hapus catatan "${note.title}"? Tindakan ini tidak bisa dibatalkan.`}
          />
        </div>
      </div>

      <header className="mb-8 border-b border-border pb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{note.title}</h1>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-4" />
            <time dateTime={note.learned_on}>{formatDate(note.learned_on)}</time>
          </span>
          {note.subject && <SubjectChip subject={note.subject} />}
          {note.topic && (
            <Link href={`/notes?topic=${note.topic.id}`} className="chip bg-surface-2 text-muted hover:text-text">
              {note.topic.title}
            </Link>
          )}
          {note.tags.map((tag) => (
            <Tag key={tag} tag={tag} href={`/notes?tag=${encodeURIComponent(tag)}`} />
          ))}
        </div>
      </header>

      {note.content.trim() ? (
        <Markdown content={note.content} />
      ) : (
        <p className="text-muted">
          Catatan ini masih kosong.{" "}
          <Link href={`/notes/${note.id}/edit`} className="text-accent">
            Mulai menulis
          </Link>
        </p>
      )}

      <p className="mt-12 text-xs text-muted">Terakhir diubah {formatDate(note.updated_at)}</p>

      {resources.length > 0 && (
        <section className="mt-10 border-t border-border pt-8">
          <h2 className="mb-3 font-semibold">Sumber belajar untuk topik ini</h2>
          <div className="space-y-3">
            {resources.map((resource) => (
              <ResourceCard key={resource.id} resource={resource} />
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
