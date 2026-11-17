import type { Metadata } from "next";
import Link from "next/link";
import { Library, NotebookPen } from "lucide-react";
import { SharedTitle } from "@/components/motion";
import { SubjectFormPanel } from "@/components/subject-form";
import { EmptyState, PageHeader, ProgressBar } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { SUBJECT_COLORS } from "@/lib/constants";
import { countBy } from "@/lib/queries";
import type { Subject, SyllabusItem } from "@/lib/types";
import { cn, percent } from "@/lib/utils";

export const metadata: Metadata = { title: "Subjek & Silabus" };

export default async function SubjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const { supabase } = await requireUser();
  const { new: openNew } = await searchParams;

  const [subjectsRes, topicsRes, notesRes, resourcesRes] = await Promise.all([
    supabase.from("subjects").select("*").order("created_at"),
    supabase.from("syllabus_items").select("subject_id, title, status").order("position"),
    supabase.from("notes").select("subject_id"),
    supabase.from("resources").select("subject_id"),
  ]);

  const subjects = (subjectsRes.data ?? []) as Subject[];
  const topics = (topicsRes.data ?? []) as Pick<SyllabusItem, "subject_id" | "title" | "status">[];
  const noteCounts = countBy(notesRes.data ?? [], (n) => n.subject_id as string | null);
  const resourceCounts = countBy(resourcesRes.data ?? [], (r) => r.subject_id as string | null);

  return (
    <>
      <PageHeader
        title="Subjek & Silabus"
        description="Kelompokkan materi per bidang, lalu susun silabusnya topik demi topik."
        actions={<SubjectFormPanel defaultOpen={openNew === "1"} />}
      />

      {subjects.length === 0 ? (
        <EmptyState
          shapes={[
            ["square", "green"],
            ["circle", "yellow"],
            ["triangle", "blue"],
          ]}
          title="Belum ada subjek"
          description="Buat subjek pertamamu, mis. “Machine Learning” atau “Statistika untuk Data Science”."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {subjects.map((subject) => {
            const own = topics.filter((t) => t.subject_id === subject.id);
            const done = own.filter((t) => t.status === "completed").length;
            const current = own.find((t) => t.status === "in_progress");
            const color = SUBJECT_COLORS[subject.color] ?? SUBJECT_COLORS.teal;
            return (
              <Link
                key={subject.id}
                href={`/subjects/${subject.id}`}
                className="card lift flex flex-col p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus) sm:p-6"
              >
                <div className="flex items-start gap-3.5">
                  <span
                    aria-hidden="true"
                    className={cn("flex size-10 shrink-0 items-center justify-center rounded-control [&::before]:size-3.5", color.soft)}
                  />
                  {/* The name travels to the subject's page when it opens. */}
                  <SharedTitle name={`subject-${subject.id}`}>
                    <h2 className="display w-fit pt-1.5 text-[1.375rem] leading-tight tracking-[-0.02em]">{subject.title}</h2>
                  </SharedTitle>
                </div>
                {subject.description && (
                  <p className="mt-3 line-clamp-2 text-[0.9375rem] text-text-2">{subject.description}</p>
                )}
                <div className="mt-auto pt-6">
                  {current && (
                    <p className="mb-2.5 truncate text-[0.8125rem] text-muted">
                      Sedang: <span className="font-medium text-text">{current.title}</span>
                    </p>
                  )}
                  <ProgressBar value={percent(done, own.length)} barClassName={color.bar} className="h-2" />
                  <div className="mt-3 flex items-center gap-4 text-[0.8125rem] text-muted">
                    <span className="tabular-nums">
                      {done}/{own.length} topik selesai
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <NotebookPen className="size-3.5" /> {noteCounts[subject.id] ?? 0}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Library className="size-3.5" /> {resourceCounts[subject.id] ?? 0}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
