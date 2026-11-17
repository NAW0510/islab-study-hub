import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { NoteCard } from "@/components/note-card";
import { ResourceCard } from "@/components/resource-card";
import { Shape, type ShapeColor, type ShapeKind } from "@/components/shape";
import { navNumber } from "@/components/shell/nav-items";
import { ChapterTitle, ProgressBar, StatusBadge } from "@/components/ui";
import { TermMarquee, TermMarqueePause } from "@/components/vocab/term-marquee";
import { requireUser } from "@/lib/auth";
import { SUBJECT_COLORS } from "@/lib/constants";
import { getProfile, NOTE_SELECT, RESOURCE_SELECT } from "@/lib/queries";
import { addDays, currentWeekInfo, weekLabel } from "@/lib/report-template";
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

  const [
    subjectsRes,
    topicsRes,
    recentNotesRes,
    noteCountRes,
    weekNotesRes,
    queueRes,
    profile,
    reportsRes,
    termCountRes,
    nearTermsRes,
    latestTermsRes,
  ] = await Promise.all([
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
    // Kosakata (spec §9): total, the dates around today (the current Week is
    // somewhere in today ± 6 days; filtered below once the programme start is
    // known), and the 20 most recent terms for the strip.
    supabase.from("vocab_terms").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase
      .from("vocab_terms")
      .select("learned_on")
      .is("deleted_at", null)
      .gte("learned_on", isoDaysAgo(6))
      .lte("learned_on", addDays(todayISO(), 6)),
    supabase
      .from("vocab_terms")
      .select("id, term")
      .is("deleted_at", null)
      .order("learned_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20),
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
  const { week: currentWeek, period, marker: weekMark, periodLabel } = currentWeekInfo(profile?.program_start, todayISO());
  const termCount = termCountRes.count ?? 0;
  const termsThisWeek = ((nearTermsRes.data ?? []) as { learned_on: string }[]).filter(
    (t) => t.learned_on >= period.start && t.learned_on <= period.end,
  ).length;
  const latestTerms = (latestTermsRes.data ?? []) as { id: string; term: string }[];

  const currentReport = ((reportsRes.data ?? []) as Pick<WeeklyReport, "id" | "week_number" | "status">[]).find(
    (r) => r.week_number === currentWeek,
  );

  if (subjects.length === 0) {
    return <Welcome name={name} />;
  }

  const week = weekLabel(currentWeek);
  const reportState = currentReport?.status === "sent" ? "sudah terkirim" : currentReport ? "masih draft" : "belum dibuat";
  const summary = `${inProgress.length} topik sedang dipelajari, ${termsThisWeek} istilah baru minggu ini, dan laporan ${week} ${reportState}.`;
  // Chapters are numbered in the order they show (the term strip only shows when there are terms).
  let chapter = 0;
  const nextChapter = () => navNumber(chapter++);

  return (
    <div className="space-y-11">
      <header>
        <p className="eyebrow">
          <span className="font-display text-xs tracking-[0.06em] text-text tabular-nums">{weekMark}</span>
          <span className="eyebrow-rule" />
          {periodLabel}
        </p>
        <h1 className="display mt-4 flex flex-wrap items-center gap-x-[0.28em] gap-y-1 text-[clamp(2.25rem,1.1rem+4.2vw,4.75rem)] leading-[1.02]">
          <span>{greeting()},</span>
          <span aria-hidden="true" className="inline-flex items-center gap-[0.18em]">
            <Shape kind="square" color="green" className="bob size-[0.7em]" />
            <Shape kind="half" color="yellow" className="bob bob-1 size-[0.7em]" />
            <Shape kind="triangle" color="blue" className="bob bob-2 size-[0.7em]" />
          </span>
          <span>{name}</span>
          <Shape kind="spark" color="red" className="bob bob-3 size-[0.6em]" />
        </h1>
        <p className="mt-4 max-w-2xl text-base text-text-2 sm:text-lg">{summary}</p>
      </header>

      {currentReport?.status !== "sent" && (
        <section
          aria-label={`Laporan ${week}`}
          className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-card bg-mark-yellow-soft px-5 py-4"
        >
          <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-control bg-mark-yellow">
            <Shape kind="circle" color="paper-ink" className="size-4" />
          </span>
          <p className="min-w-0 flex-[1_1_16rem] text-[0.9375rem]">
            <strong className="font-semibold">
              Laporan {week} {reportState}.
            </strong>{" "}
            <span className="text-text-2">Kirim ke mentor Sabtu atau Minggu, {periodLabel}.</span>
          </p>
          <Link
            href={currentReport ? `/reports/${currentReport.id}` : `/reports/new?week=${currentWeek}`}
            className="btn btn-ring h-11 px-5 text-[0.9375rem]"
          >
            {currentReport ? "Lanjutkan draft" : "Buat laporan"} <ArrowRight className="size-4" />
          </Link>
        </section>
      )}

      <section className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5" aria-label="Ringkasan">
        <Stat
          href="/subjects"
          label="Topik selesai"
          value={`${done}/${topics.length}`}
          hint={`${percent(done, topics.length)}% dari silabus`}
          tile="bg-mark-green"
          mark={<Shape kind="square" color="paper" className="size-[0.8125rem]" />}
        />
        <Stat
          href="/subjects"
          label="Sedang dipelajari"
          value={inProgress.length}
          hint="topik aktif"
          tile="bg-mark-yellow"
          mark={<Shape kind="circle" color="paper-ink" className="size-[0.8125rem]" />}
        />
        <Stat
          href="/notes"
          label="Total catatan"
          value={noteCount}
          hint={`${subjects.length} subjek`}
          tile="bg-mark-red"
          mark={<Shape kind="triangle" color="paper" className="size-[0.8125rem]" />}
        />
        <Stat
          href="/notes"
          label="Hari belajar"
          value={`${studyDays}/7`}
          hint="7 hari terakhir"
          tile="bg-mark-blue"
          mark={<Shape kind="half" color="paper" className="size-[0.8125rem]" />}
        />
        <Stat
          href="/vocab"
          label="Istilah"
          value={termCount}
          hint={`${termsThisWeek} baru minggu ini`}
          tile="bg-text"
          mark={<Shape kind="plus" color="yellow" className="size-[0.8125rem]" />}
          className="col-span-2 sm:col-span-1"
        />
      </section>

      {latestTerms.length > 0 && (
        <section className="marquee-host" aria-labelledby="istilah-terbaru">
          <ChapterTitle
            id="istilah-terbaru"
            number={nextChapter()}
            shape="plus"
            color="yellow"
            title="Istilah terbaru"
            action={
              <div className="flex items-center gap-1">
                <TermMarqueePause />
                <ChapterLink href="/vocab">Kosakata</ChapterLink>
              </div>
            }
          />
          <TermMarquee terms={latestTerms} />
        </section>
      )}

      <div className="grid gap-11 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="fokus-sekarang">
          <ChapterTitle
            id="fokus-sekarang"
            number={nextChapter()}
            shape="triangle"
            color="red"
            title="Fokus sekarang"
            action={<ChapterLink href="/subjects">Semua silabus</ChapterLink>}
          />
          {focus.length === 0 ? (
            <p className="card px-5 py-6 text-center text-sm text-muted">
              Belum ada topik yang sedang dipelajari. Buka silabus dan ubah status topik menjadi{" "}
              <span className="font-medium text-text">Sedang dipelajari</span>.
            </p>
          ) : (
            <ul className="card divide-y divide-border">
              {focus.map((topic) => {
                const subject = subjectById.get(topic.subject_id);
                const tone = SUBJECT_COLORS[subject?.color ?? "slate"] ?? SUBJECT_COLORS.slate;
                const dueIn = topic.target_date ? daysFromToday(topic.target_date) : null;
                const late = dueIn !== null && dueIn < 0;
                return (
                  <li key={topic.id} className="flex items-center gap-4 px-5 py-4">
                    <span
                      aria-hidden="true"
                      className={cn("flex size-9 shrink-0 items-center justify-center rounded-control [&::before]:size-3", tone.soft)}
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/subjects/${topic.subject_id}`}
                        className="block truncate font-semibold hover:text-accent"
                      >
                        {topic.title}
                      </Link>
                      <p className="mt-0.5 truncate text-[0.8125rem] text-muted">
                        {subject?.title}
                        {topic.target_date && (
                          <>
                            {subject && " · "}
                            <span className={cn(late && "font-medium text-danger")}>
                              {dueIn === 0
                                ? "target hari ini"
                                : late
                                  ? `terlambat ${-dueIn} hari`
                                  : `target ${formatDate(topic.target_date, { withYear: false })}`}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                    <StatusBadge status={topic.status} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="progres-subjek">
          <ChapterTitle id="progres-subjek" number={nextChapter()} shape="square" color="green" title="Progres subjek" />
          <ul className="card divide-y divide-border px-1.5">
            {subjects.slice(0, 6).map((subject) => {
              const own = topics.filter((t) => t.subject_id === subject.id);
              const ownDone = own.filter((t) => t.status === "completed").length;
              const pct = percent(ownDone, own.length);
              return (
                <li key={subject.id}>
                  <Link href={`/subjects/${subject.id}`} className="block rounded-control px-3.5 py-3 hover:bg-surface-2/60">
                    <div className="mb-2.5 flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-semibold">{subject.title}</span>
                      <span className="shrink-0 font-display text-xs text-muted tabular-nums">
                        {ownDone}/{own.length}
                      </span>
                    </div>
                    <ProgressBar value={pct} className="h-2" barClassName={SUBJECT_COLORS[subject.color]?.bar} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section aria-labelledby="catatan-terbaru">
        <ChapterTitle
          id="catatan-terbaru"
          number={nextChapter()}
          shape="circle"
          color="blue"
          title="Catatan terbaru"
          action={<ChapterLink href="/notes">Semua catatan</ChapterLink>}
        />
        {recentNotes.length === 0 ? (
          <p className="card px-5 py-6 text-center text-sm text-muted">
            Belum ada catatan.{" "}
            <Link href="/notes/new" className="font-medium text-accent">
              Tulis catatan pertama
            </Link>
          </p>
        ) : (
          <div className="grid gap-3.5 md:grid-cols-2">
            {recentNotes.map((note) => (
              <NoteCard key={note.id} note={note} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="antrian-belajar">
        <ChapterTitle
          id="antrian-belajar"
          number={nextChapter()}
          shape="half"
          color="blue"
          title="Antrian belajar"
          action={<ChapterLink href="/resources">Semua sumber</ChapterLink>}
        />
        {queue.length === 0 ? (
          <p className="card px-5 py-6 text-center text-sm text-muted">
            Tidak ada sumber yang menunggu.{" "}
            <Link href="/resources/new" className="font-medium text-accent">
              Simpan video atau dokumen
            </Link>
          </p>
        ) : (
          <div className="space-y-3.5">
            {queue.map((resource) => (
              <ResourceCard key={resource.id} resource={resource} />
            ))}
          </div>
        )}
      </section>

      <ShapeRow />
    </div>
  );
}

/** A summary tile: a coloured tile with a shape, a big number, and where it leads. */
function Stat({
  href,
  label,
  value,
  hint,
  tile,
  mark,
  className,
}: {
  href: string;
  label: string;
  value: React.ReactNode;
  hint: string;
  tile: string;
  mark: React.ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={cn("card lift flex flex-col gap-3.5 p-[1.125rem] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus)", className)}>
      <span className="flex items-start justify-between gap-2 text-[0.8125rem] leading-tight font-medium text-muted">
        <span className="pt-2">{label}</span>
        <span aria-hidden="true" className={cn("flex size-[1.875rem] shrink-0 items-center justify-center rounded-lg", tile)}>
          {mark}
        </span>
      </span>
      {/* Pushed down, so the numbers line up even when a label takes two lines. */}
      <span className="display mt-auto text-[2.75rem] leading-none tabular-nums">{value}</span>
      <span className="text-[0.8125rem] text-muted">{hint}</span>
    </Link>
  );
}

function ChapterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-9 shrink-0 items-center gap-1 px-1 text-sm font-medium whitespace-nowrap text-accent hover:text-accent-hover"
    >
      {children} <ArrowRight className="size-3.5" />
    </Link>
  );
}

/** The foot of the dashboard: a quiet row of shapes, like the end of a chapter. */
function ShapeRow() {
  const row: [ShapeKind, ShapeColor | null][] = [
    ["circle", "blue"],
    ["square", null],
    ["triangle", "yellow"],
    ["quarter", "red"],
    ["circle", null],
    ["plus", "green"],
    ["half", "blue"],
    ["circle", "yellow"],
    ["triangle", null],
    ["spark", "red"],
    ["leaf", "green"],
    ["diamond", "blue"],
  ];
  return (
    <div aria-hidden="true" className="grid max-w-xl grid-cols-12 gap-1.5 pt-2 opacity-85 sm:gap-2">
      {row.map(([kind, color], i) => (
        <Shape key={i} kind={kind} color={color ?? undefined} className={cn("w-full", !color && "bg-surface-2")} />
      ))}
    </div>
  );
}

function Welcome({ name }: { name: string }) {
  const steps: { shape: ShapeKind; color: ShapeColor; soft: string; title: string; body: string }[] = [
    {
      shape: "square",
      color: "green",
      soft: "bg-mark-green-soft",
      title: "Buat subjek",
      body: "mis. Machine Learning, Statistika, atau Python untuk Data Science.",
    },
    {
      shape: "plus",
      color: "yellow",
      soft: "bg-mark-yellow-soft",
      title: "Tempel silabus",
      body: "Satu topik per baris, lalu tandai progresmu topik demi topik.",
    },
    {
      shape: "triangle",
      color: "red",
      soft: "bg-mark-red-soft",
      title: "Tulis catatan",
      body: "Markdown + rumus LaTeX, terhubung ke topik silabusnya.",
    },
    {
      shape: "half",
      color: "blue",
      soft: "bg-mark-blue-soft",
      title: "Simpan sumber",
      body: "Video YouTube, PDF, artikel, atau kursus untuk dipelajari.",
    },
  ];

  return (
    <div className="mx-auto max-w-2xl py-6">
      <h1 className="display text-[clamp(2rem,1.2rem+3vw,3.25rem)] text-balance">Selamat datang, {name}</h1>
      <p className="mt-3 text-text-2">Ini tempat untuk mencatat semua yang kamu pelajari di IS Lab. Mulai dari sini:</p>
      <ul className="mt-8 grid gap-3.5 sm:grid-cols-2">
        {steps.map(({ shape, color, soft, title, body }) => (
          <li key={title} className="card p-5">
            <span aria-hidden="true" className={cn("mb-4 flex size-9 items-center justify-center rounded-control", soft)}>
              <Shape kind={shape} color={color} className="size-3.5" />
            </span>
            <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
            <p className="mt-1 text-sm text-muted">{body}</p>
          </li>
        ))}
      </ul>
      <Link href="/subjects?new=1" className="btn btn-ring mt-8 h-11 px-5">
        <Plus className="size-4" /> Buat subjek pertama
      </Link>
    </div>
  );
}
