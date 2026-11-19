import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Pencil } from "lucide-react";
import { DeleteButton } from "@/components/action-buttons";
import { Markdown } from "@/components/markdown";
import { SharedTitle } from "@/components/motion";
import { ResourceCard } from "@/components/resource-card";
import { SectionMark } from "@/components/section-mark";
import { ChapterTitle, SubjectChip, Tag } from "@/components/ui";
import { deleteNote } from "@/lib/actions/notes";
import { requireUser } from "@/lib/auth";
import { NOTE_SELECT, RESOURCE_SELECT } from "@/lib/queries";
import type { NoteWithRefs, ResourceWithRefs } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { asDomainColor, DOMAIN_TONE_CLASS } from "@/lib/vocab/seed-domains";

type RelatedTerm = {
  id: string;
  term: string;
  deleted_at: string | null;
  domain: { name: string; color: string } | null;
};

export const metadata: Metadata = { title: "Catatan" };

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireUser();
  const { id } = await params;

  // One round trip: the note, every resource linked to the same syllabus topic,
  // and the Kosakata terms linked to this note.
  const { data: note } = await supabase
    .from("notes")
    .select(
      `${NOTE_SELECT}, topic_resources:syllabus_items(resources(${RESOURCE_SELECT})), related_terms:vocab_terms(id, term, deleted_at, domain:vocab_domains(name, color))`,
    )
    .eq("id", id)
    .maybeSingle<
      NoteWithRefs & { topic_resources: { resources: ResourceWithRefs[] } | null; related_terms: RelatedTerm[] | null }
    >();
  if (!note) notFound();

  const terms = (note.related_terms ?? [])
    .filter((t) => !t.deleted_at)
    .sort((a, b) => a.term.localeCompare(b.term, "id"));

  const resources = [...(note.topic_resources?.resources ?? [])].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );

  return (
    <article className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-2">
        <SectionMark>
          <Link href="/notes" className="inline-flex items-center gap-1 hover:text-text">
            <ArrowLeft className="size-3.5" /> Semua catatan
          </Link>
        </SectionMark>
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

      <header className="mb-10 border-b border-border pb-7">
        {/* The same title as on the card that opened this page: it travels here. */}
        <SharedTitle name={`note-${note.id}`}>
          <h1 className="display w-fit text-[clamp(2rem,1.35rem+2.6vw,3.25rem)] leading-[1.04] text-balance">
            {note.title}
          </h1>
        </SharedTitle>
        <div className="mt-5 flex flex-wrap items-center gap-2 text-sm text-muted">
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

      {terms.length > 0 && (
        <section className="mt-12 border-t border-border pt-8" aria-labelledby="istilah-terkait">
          <ChapterTitle id="istilah-terkait" number="01" shape="plus" color="yellow" title="Istilah terkait" />
          <ul className="flex flex-wrap gap-2">
            {terms.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/vocab?term=${t.id}`}
                  title={t.domain?.name ?? "Tanpa domain"}
                  className={cn(
                    "chip chip-tone min-h-8 hover:opacity-80 pointer-coarse:min-h-11",
                    DOMAIN_TONE_CLASS[asDomainColor(t.domain?.color)],
                  )}
                >
                  {t.term}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {resources.length > 0 && (
        <section className="mt-12 border-t border-border pt-8" aria-labelledby="sumber-topik">
          <ChapterTitle
            id="sumber-topik"
            number={terms.length > 0 ? "02" : "01"}
            shape="half"
            color="blue"
            title="Sumber belajar untuk topik ini"
          />
          <div className="space-y-3.5">
            {resources.map((resource) => (
              <ResourceCard key={resource.id} resource={resource} />
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
