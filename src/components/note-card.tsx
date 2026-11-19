import Link from "next/link";
import type { NoteWithRefs } from "@/lib/types";
import { excerpt, formatDate } from "@/lib/utils";
import { SubjectChip, Tag } from "./ui";

export function NoteCard({ note }: { note: NoteWithRefs }) {
  const preview = excerpt(note.content);
  return (
    <article className="card group relative p-4 transition hover:border-accent/40 sm:p-5">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        <time dateTime={note.learned_on}>{formatDate(note.learned_on)}</time>
        {note.topic && (
          <>
            <span aria-hidden>·</span>
            <span className="truncate">{note.topic.title}</span>
          </>
        )}
      </div>
      <h3 className="font-display font-semibold tracking-tight text-balance group-hover:text-accent">
        <Link href={`/notes/${note.id}`} className="after:absolute after:inset-0">
          {note.title}
        </Link>
      </h3>
      {preview && <p className="mt-1.5 line-clamp-2 text-sm text-muted">{preview}</p>}
      {(note.subject || note.tags.length > 0) && (
        // Chips sit above the full-card link so they stay clickable.
        <div className="relative z-10 mt-3 flex flex-wrap items-center gap-1.5">
          {note.subject && <SubjectChip subject={note.subject} />}
          {note.tags.slice(0, 5).map((tag) => (
            <Tag key={tag} tag={tag} href={`/notes?tag=${encodeURIComponent(tag)}`} />
          ))}
        </div>
      )}
    </article>
  );
}
