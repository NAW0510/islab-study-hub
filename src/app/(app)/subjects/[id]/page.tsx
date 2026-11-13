import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Library, NotebookPen, Plus } from "lucide-react";
import { DeleteButton } from "@/components/action-buttons";
import { NoteCard } from "@/components/note-card";
import { ResourceCard } from "@/components/resource-card";
import { SubjectFormPanel } from "@/components/subject-form";
import { SyllabusList } from "@/components/syllabus-list";
import { EmptyState, PageHeader, ProgressBar } from "@/components/ui";
import { UrlTabs } from "@/components/url-tabs";
import { deleteSubject } from "@/lib/actions/subjects";
import { requireUser } from "@/lib/auth";
import { SUBJECT_COLORS } from "@/lib/constants";
import { countBy, NOTE_SELECT, RESOURCE_SELECT } from "@/lib/queries";
import type { NoteWithRefs, ResourceWithRefs, Subject, SyllabusItem } from "@/lib/types";
import { cn, percent } from "@/lib/utils";

type Tab = "silabus" | "catatan" | "sumber";

export const metadata: Metadata = { title: "Subjek" };

export default async function SubjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { supabase } = await requireUser();
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const tab: Tab = tabParam === "catatan" || tabParam === "sumber" ? tabParam : "silabus";

  // Everything in one parallel round trip (the subject check no longer blocks the rest).
  const [{ data: subject }, topicsRes, notesRes, resourcesRes] = await Promise.all([
    supabase.from("subjects").select("*").eq("id", id).maybeSingle<Subject>(),
    supabase.from("syllabus_items").select("*").eq("subject_id", id).order("position").order("created_at"),
    supabase
      .from("notes")
      .select(NOTE_SELECT)
      .eq("subject_id", id)
      .order("learned_on", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("resources").select(RESOURCE_SELECT).eq("subject_id", id).order("created_at", { ascending: false }),
  ]);
  if (!subject) notFound();

  const topics = (topicsRes.data ?? []) as SyllabusItem[];
  const notes = (notesRes.data ?? []) as NoteWithRefs[];
  const resources = (resourcesRes.data ?? []) as ResourceWithRefs[];

  const done = topics.filter((t) => t.status === "completed").length;
  const active = topics.filter((t) => t.status === "in_progress").length;
  const color = SUBJECT_COLORS[subject.color] ?? SUBJECT_COLORS.teal;

  const noteCounts = countBy(notes, (n) => n.syllabus_item_id);
  const resourceCounts = countBy(resources, (r) => r.syllabus_item_id);
  const counts = Object.fromEntries(
    topics.map((t) => [t.id, { notes: noteCounts[t.id] ?? 0, resources: resourceCounts[t.id] ?? 0 }]),
  );

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "silabus", label: "Silabus", count: topics.length },
    { key: "catatan", label: "Catatan", count: notes.length },
    { key: "sumber", label: "Sumber belajar", count: resources.length },
  ];
  const selfHref = `/subjects/${id}`;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/subjects" className="inline-flex items-center gap-1 hover:text-text">
            <ArrowLeft className="size-3.5" /> Semua subjek
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            <span className={cn("size-3 shrink-0 rounded-full", color.dot)} />
            {subject.title}
          </span>
        }
        description={subject.description}
        actions={
          <>
            <SubjectFormPanel subject={subject} />
            <DeleteButton
              action={deleteSubject.bind(null, subject.id)}
              confirmText={`Hapus subjek "${subject.title}" beserta seluruh silabusnya? Catatan & sumber belajar tetap disimpan (tanpa subjek).`}
            />
          </>
        }
      />

      <div className="card mb-8 p-4">
        <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span>
            <span className="font-semibold tabular-nums">{done}</span>
            <span className="text-muted"> dari {topics.length} topik selesai</span>
            {active > 0 && <span className="text-muted"> · {active} sedang dipelajari</span>}
          </span>
          <span className="font-semibold tabular-nums">{percent(done, topics.length)}%</span>
        </div>
        <ProgressBar value={percent(done, topics.length)} barClassName={color.bar} className="h-2" />
      </div>

      <UrlTabs
        label="Bagian subjek"
        tabs={tabs}
        initial={tab}
        panels={{
          silabus: <SyllabusList subjectId={id} items={topics} counts={counts} />,
          catatan: (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Link href={`/notes/new?subject=${id}`} className="btn btn-primary">
                  <Plus className="size-4" /> Catatan baru
                </Link>
              </div>
              {notes.length === 0 ? (
                <EmptyState
                  icon={NotebookPen}
                  title="Belum ada catatan"
                  description="Tulis ringkasan dari materi yang sudah kamu pelajari di subjek ini."
                />
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {notes.map((note) => (
                    <NoteCard key={note.id} note={note} />
                  ))}
                </div>
              )}
            </div>
          ),
          sumber: (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Link
                  href={`/resources/new?subject=${id}&return_to=${encodeURIComponent(`${selfHref}?tab=sumber`)}`}
                  className="btn btn-primary"
                >
                  <Plus className="size-4" /> Tambah sumber
                </Link>
              </div>
              {resources.length === 0 ? (
                <EmptyState
                  icon={Library}
                  title="Belum ada sumber belajar"
                  description="Simpan video YouTube, PDF, atau artikel yang kamu perlukan untuk subjek ini."
                />
              ) : (
                <div className="space-y-3">
                  {resources.map((resource) => (
                    <ResourceCard key={resource.id} resource={resource} />
                  ))}
                </div>
              )}
            </div>
          ),
        }}
      />
    </>
  );
}
