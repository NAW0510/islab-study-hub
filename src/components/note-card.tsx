import Link from "next/link";
import type { NoteWithRefs } from "@/lib/types";
import { excerpt, formatDate } from "@/lib/utils";
import { SharedTitle } from "./motion";
import { SubjectChip, Tag } from "./ui";

export function NoteCard({ note }: { note: NoteWithRefs }) {
  const preview = excerpt(note.content);
  return (
    <article className="card lift group relative p-5 sm:px-[1.375rem]">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[0.8125rem] text-muted">
        <time dateTime={note.learned_on}>{formatDate(note.learned_on)}</time>
        {note.topic && (
          <>
            <span aria-hidden>·</span>
            <span className="truncate">{note.topic.title}</span>
          </>
        )}
      </div>
      {/* The title travels to the note's page when it opens. */}
      <SharedTitle name={`note-${note.id}`}>
        <h3 className="display w-fit text-[1.375rem] leading-tight tracking-[-0.02em] text-balance">
          <Link href={`/notes/${note.id}`} className="after:absolute after:inset-0 after:rounded-card">
            {note.title}
          </Link>
        </h3>
      </SharedTitle>
      {preview && <p className="mt-2 line-clamp-2 max-w-[46ch] text-[0.9375rem] text-text-2">{preview}</p>}
      {(note.subject || note.tags.length > 0) && (
        // Chips sit above the full-card link so they stay clickable.
        <div className="relative z-10 mt-3.5 flex flex-wrap items-center gap-1.5">
          {note.subject && <SubjectChip subject={note.subject} />}
          {note.tags.slice(0, 5).map((tag) => (
            <Tag key={tag} tag={tag} href={`/notes?tag=${encodeURIComponent(tag)}`} />
          ))}
        </div>
      )}
    </article>
  );
}
