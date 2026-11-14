import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Flame,
  Library,
  NotebookPen,
  Plus,
  Target,
} from "lucide-react";
import { NoteCard } from "@/components/note-card";
import { ResourceCard } from "@/components/resource-card";
import { ProgressBar, StatusBadge, SubjectChip } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { SUBJECT_COLORS } from "@/lib/constants";
import { getProfile, NOTE_SELECT, RESOURCE_SELECT } from "@/lib/queries";
import { currentWeekInfo, weekLabel } from "@/lib/report-template";
import type { NoteWithRefs, ResourceWithRefs, Subject, SyllabusItem, WeeklyReport } from "@/lib/types";
import { cn, daysFromToday, formatDate, percent, TIMEZONE, todayISO } from "@/lib/utils";

type TopicRow = Pick<SyllabusItem, "id" | "subject_id" | "title" | "status" | "target_date">;

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: TIMEZONE }).format(new Date()),
  );
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 19) return "Selamat sore";
  return "Selamat malam";
}

function isoDaysAgo(days: number) {
  const d = new Date(`${todayISO()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export default async function DashboardPage() {
  const { supabase, email } = await requireUser();

  const [subjectsRes, topicsRes, recentNotesRes, noteCountRes, weekNotesRes, queueRes, profile, reportsRes] = await Promise.all([
    supabase.from("subjects").select("*").order("updated_at", { ascending: false }),
    supabase.from("syllabus_items").select("id, subject_id, title, status, target_date").order("position"),
    supabase
      .from("notes")
      .select(NOTE_SELECT)
      .order("learned_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(4),
    supabase.from("notes").select("id", { count: "exact", head: true }),
    supabase.from("notes").select("learned_on").gte("learned_on", isoDaysAgo(6)),
    supabase
      .from("resources")
      .select(RESOURCE_SELECT)
      .neq("status", "completed")
      .order("status") // "in_progress" sorts before "not_started"
      .order("created_at", { ascending: false })
      .limit(3),
    getProfile(supabase),
    supabase.from("weekly_reports").select("id, week_number, status"),
  ]);

  const subjects = (subjectsRes.data ?? []) as Subject[];
  const topics = (topicsRes.data ?? []) as TopicRow[];
  const recentNotes = (recentNotesRes.data ?? []) as NoteWithRefs[];
  const queue = (queueRes.data ?? []) as ResourceWithRefs[];
  const noteCount = noteCountRes.count ?? 0;
  const studyDays = new Set((weekNotesRes.data ?? []).map((n) => n.learned_on as string)).size;

  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const done = topics.filter((t) => t.status === "completed").length;
  const inProgress = topics.filter((t) => t.status === "in_progress");

  // Focus list: topics in progress, plus unfinished topics that are overdue or due within 14 days.
  const focus = topics
    .filter(
      (t) =>
        t.status === "in_progress" ||
        (t.status !== "completed" && t.target_date && daysFromToday(t.target_date) <= 14),
    )
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "in_progress" ? -1 : 1;
      return (a.target_date ?? "9999").localeCompare(b.target_date ?? "9999");
    })
    .slice(0, 6);

  const name = profile?.full_name?.split(" ")[0] || email.split("@")[0];

  // Weekly report reminder (due every Saturday/Sunday).
  const { week: currentWeek, marker: weekMark, periodLabel } = currentWeekInfo(profile?.program_start, todayISO());
  const currentReport = ((reportsRes.data ?? []) as Pick<WeeklyReport, "id" | "week_number" | "status">[]).find(
    (r) => r.week_number === currentWeek,
  );

  if (subjects.length === 0) {
    return <Welcome name={name} />;
  }

  return (
    <div className="space-y-10">
      <header>
        <p className="eyebrow">
          <span className="font-display text-xs tracking-[0.08em] text-text tabular-nums">{weekMark}</span>
          <span className="eyebrow-rule" />
          {periodLabel}
        </p>
        <h1 className="display mt-3 text-[clamp(1.75rem,1.2rem+2.4vw,2.75rem)] text-balance">
          {greeting()}, {name}
        </h1>
        <p className="mt-2 text-sm text-muted">{formatDate(todayISO())}</p>
      </header>

      {currentReport?.status !== "sent" && (
        <Link
          href={currentReport ? `/reports/${currentReport.id}` : `/reports/new?week=${currentWeek}`}
          className="card -mt-4 flex items-center gap-3 border-accent/30 bg-accent-soft/40 px-4 py-3 transition hover:border-accent/60"
        >
          <ClipboardList className="size-5 shrink-0 text-accent" />
          <span className="min-w-0 flex-1 text-sm">
            <span className="font-medium">
              Laporan {weekLabel(currentWeek)} {currentReport ? "masih draft" : "belum dibuat"}
            </span>
            <span className="text-muted">
              {" "}
              · {periodLabel} · kirim ke mentor Sabtu/Minggu
            </span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-accent" />
        </Link>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Ringkasan">
        <Stat
          icon={CheckCircle2}
          label="Topik selesai"
          value={`${done}/${topics.length}`}
          hint={`${percent(done, topics.length)}% dari silabus`}
        />
        <Stat icon={Target} label="Sedang dipelajari" value={inProgress.length} hint="topik aktif" />
        <Stat icon={NotebookPen} label="Total catatan" value={noteCount} hint={`${subjects.length} subjek`} />
        <Stat icon={Flame} label="Hari belajar" value={`${studyDays}/7`} hint="7 hari terakhir" />
      </section>

      <div className="grid gap-10 lg:grid-cols-[1fr_20rem]">
        <section>
          <SectionTitle title="Fokus sekarang" href="/subjects" linkLabel="Semua silabus" />
          {focus.length === 0 ? (
            <p className="card px-4 py-6 text-center text-sm text-muted">
              Belum ada topik yang sedang dipelajari. Buka silabus dan ubah status topik menjadi{" "}
              <span className="font-medium text-text">Sedang dipelajari</span>.
            </p>
          ) : (
            <ul className="card divide-y divide-border">
              {focus.map((topic) => {
                const subject = subjectById.get(topic.subject_id);
                const dueIn = topic.target_date ? daysFromToday(topic.target_date) : null;
                return (
                  <li key={topic.id} className="px-4 py-3">
                    <Link href={`/subjects/${topic.subject_id}`} className="block truncate font-medium hover:text-accent">
                      {topic.title}
                    </Link>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted">
                      <StatusBadge status={topic.status} />
                      {subject && <SubjectChip subject={subject} />}
                      {topic.target_date && (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1",
                            dueIn !== null && dueIn < 0 && "font-medium text-danger",
                          )}
                        >
                          <CalendarDays className="size-3.5" />
                          {dueIn === 0
                            ? "Target hari ini"
                            : dueIn !== null && dueIn < 0
                              ? `Terlambat ${-dueIn} hari`
                              : `Target ${formatDate(topic.target_date, { withYear: false })}`}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <SectionTitle title="Progres subjek" />
          <ul className="card divide-y divide-border">
            {subjects.slice(0, 6).map((subject) => {
              const own = topics.filter((t) => t.subject_id === subject.id);
              const ownDone = own.filter((t) => t.status === "completed").length;
              const pct = percent(ownDone, own.length);
              return (
                <li key={subject.id}>
                  <Link href={`/subjects/${subject.id}`} className="block px-4 py-3 hover:bg-surface-2/60">
                    <div className="mb-2 flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{subject.title}</span>
                      <span className="shrink-0 text-xs text-muted tabular-nums">
                        {ownDone}/{own.length}
                      </span>
                    </div>
                    <ProgressBar value={pct} barClassName={SUBJECT_COLORS[subject.color]?.bar} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section>
        <SectionTitle title="Catatan terbaru" href="/notes" linkLabel="Semua catatan" />
        {recentNotes.length === 0 ? (
          <p className="card px-4 py-6 text-center text-sm text-muted">
            Belum ada catatan.{" "}
            <Link href="/notes/new" className="font-medium text-accent">
              Tulis catatan pertama
            </Link>
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {recentNotes.map((note) => (
              <NoteCard key={note.id} note={note} />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle title="Antrian belajar" href="/resources" linkLabel="Semua sumber" />
        {queue.length === 0 ? (
          <p className="card px-4 py-6 text-center text-sm text-muted">
            Tidak ada sumber yang menunggu.{" "}
            <Link href="/resources/new" className="font-medium text-accent">
              Simpan video atau dokumen
            </Link>
          </p>
        ) : (
          <div className="space-y-3">
            {queue.map((resource) => (
              <ResourceCard key={resource.id} resource={resource} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Flame;
  label: string;
  value: React.ReactNode;
  hint: string;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted">
        <Icon className="size-4" />
        {label}
      </div>
      <div className="display mt-3 text-3xl tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted">{hint}</div>
    </div>
  );
}

function SectionTitle({ title, href, linkLabel }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
      {href && (
        <Link href={href} className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
          {linkLabel} <ArrowRight className="size-3.5" />
        </Link>
      )}
    </div>
  );
}

function Welcome({ name }: { name: string }) {
  const steps = [
    {
      icon: BookOpen,
      title: "Buat subjek",
      body: "mis. Machine Learning, Statistika, atau Python untuk Data Science.",
    },
    {
      icon: Target,
      title: "Tempel silabus",
      body: "Satu topik per baris, lalu tandai progresmu topik demi topik.",
    },
    {
      icon: NotebookPen,
      title: "Tulis catatan",
      body: "Markdown + rumus LaTeX, terhubung ke topik silabusnya.",
    },
    {
      icon: Library,
      title: "Simpan sumber",
      body: "Video YouTube, PDF, artikel, atau kursus untuk dipelajari.",
    },
  ];

  return (
    <div className="mx-auto max-w-2xl py-6">
      <h1 className="display text-[clamp(1.75rem,1.2rem+2.4vw,2.75rem)] text-balance">Selamat datang, {name}</h1>
      <p className="mt-2 text-muted">
        Ini tempat untuk mencatat semua yang kamu pelajari di IS Lab. Mulai dari sini:
      </p>
      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {steps.map(({ icon: Icon, title, body }) => (
          <li key={title} className="card p-4">
            <span className="mb-3 flex size-8 items-center justify-center rounded-full bg-accent-soft text-accent">
              <Icon className="size-4" />
            </span>
            <h2 className="font-display font-semibold tracking-tight">{title}</h2>
            <p className="mt-1 text-sm text-muted">{body}</p>
          </li>
        ))}
      </ul>
      <Link href="/subjects?new=1" className="btn btn-primary mt-8">
        <Plus className="size-4" /> Buat subjek pertama
      </Link>
    </div>
  );
}
