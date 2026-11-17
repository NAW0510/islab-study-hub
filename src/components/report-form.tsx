"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import { suggestReportContent } from "@/lib/actions/reports";
import { callAction } from "@/lib/call-action";
import {
  formatPeriod,
  LEARNING_SECTIONS,
  PROJECT_SECTIONS,
  weekLabel,
  weekPeriod,
  type ReportField,
} from "@/lib/report-template";
import type { ActionResult, WeeklyReport } from "@/lib/types";
import { ActionForm, SubmitButton } from "./action-form";

const MAX_WEEK = 12;

export function ReportForm({
  report,
  programStart,
  initialWeek,
  takenWeeks,
  action,
  cancelHref,
}: {
  report?: WeeklyReport;
  programStart: string;
  initialWeek: number;
  /** Weeks that already have a report (other than this one). */
  takenWeeks: number[];
  action: (formData: FormData) => Promise<ActionResult>;
  cancelHref: string;
}) {
  const [week, setWeek] = useState(report?.week_number ?? initialWeek);
  const [period, setPeriod] = useState(
    report ? { start: report.period_start, end: report.period_end } : weekPeriod(programStart, initialWeek),
  );
  const [showProject, setShowProject] = useState(
    report ? PROJECT_SECTIONS.some((s) => report[s.key].trim()) : false,
  );
  const [filling, startFill] = useTransition();
  const [fillMessage, setFillMessage] = useState<string | null>(null);

  const weekOptions = Array.from({ length: Math.max(MAX_WEEK, week) + 1 }, (_, i) => i);

  function autofill() {
    startFill(async () => {
      setFillMessage(null);
      const result = await callAction(() => suggestReportContent(period.start, period.end));
      if ("error" in result && result.error) {
        setFillMessage(result.error);
        return;
      }
      const { workedOn, learned } = result as { workedOn: string; learned: string };
      const filled: string[] = [];
      const fill = (key: ReportField, text: string, label: string) => {
        const field = document.getElementById(key) as HTMLTextAreaElement | null;
        if (!field || !text) return;
        field.value = field.value.trim() ? `${field.value.trimEnd()}\n${text}` : text;
        filled.push(label);
      };
      fill("learning_worked_on", workedOn, "What did you work on");
      fill("learning_learned", learned, "What did you learn");
      setFillMessage(
        filled.length
          ? `Ditambahkan ke: ${filled.join(" & ")}. Rapikan dulu sebelum disimpan.`
          : "Belum ada catatan, topik, sumber, atau istilah yang tercatat pada periode ini.",
      );
    });
  }

  return (
    <ActionForm action={action} className="space-y-8">
      <section className="card grid gap-4 p-5 sm:grid-cols-[12rem_1fr_1fr]">
        <div>
          <label className="label" htmlFor="week_number">
            Minggu
          </label>
          <select
            id="week_number"
            name="week_number"
            className="input"
            value={week}
            onChange={(e) => {
              const next = Number(e.target.value);
              setWeek(next);
              setPeriod(weekPeriod(programStart, next));
            }}
          >
            {weekOptions.map((w) => (
              <option key={w} value={w} disabled={takenWeeks.includes(w)}>
                {weekLabel(w)}
                {takenWeeks.includes(w) ? " (sudah ada)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="period_start">
            Mulai
          </label>
          <input
            id="period_start"
            name="period_start"
            type="date"
            required
            className="input"
            value={period.start}
            onChange={(e) => setPeriod((p) => ({ ...p, start: e.target.value }))}
          />
        </div>
        <div>
          <label className="label" htmlFor="period_end">
            Selesai
          </label>
          <input
            id="period_end"
            name="period_end"
            type="date"
            required
            className="input"
            value={period.end}
            onChange={(e) => setPeriod((p) => ({ ...p, end: e.target.value }))}
          />
        </div>
        <p className="hint sm:col-span-3">
          {weekLabel(week)} · {period.start && period.end ? formatPeriod(period.start, period.end) : "—"}. Periode
          dihitung dari tanggal mulai Week 1 di identitas laporan.
        </p>
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight">Learning Progress</h2>
            <p className="text-sm text-muted">Format &ldquo;Tabel Weekly Progress&rdquo; dari guidebook.</p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" disabled={filling} onClick={autofill}>
            {filling ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            Isi otomatis dari aktivitas minggu ini
          </button>
        </div>
        {fillMessage && <p className="mb-4 rounded-control bg-accent-soft px-3 py-2 text-sm text-accent">{fillMessage}</p>}
        <div className="space-y-5">
          {LEARNING_SECTIONS.map((s, i) => (
            <Field key={s.key} number={i + 1} section={s} defaultValue={report?.[s.key]} />
          ))}
        </div>
      </section>

      <section>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 text-left"
          aria-expanded={showProject}
          onClick={() => setShowProject((v) => !v)}
        >
          <span>
            <span className="block text-lg font-semibold">Project Progress</span>
            <span className="block text-sm text-muted">Opsional — 4 hal yang dilaporkan saat Weekly Meeting.</span>
          </span>
          <ChevronDown className={`size-5 shrink-0 text-muted transition ${showProject ? "rotate-180" : ""}`} />
        </button>
        {/* Kept mounted while collapsed so already-typed text is still submitted. */}
        <div className="mt-4 space-y-5" hidden={!showProject}>
          {PROJECT_SECTIONS.map((s, i) => (
            <Field key={s.key} number={i + 1} section={s} defaultValue={report?.[s.key]} />
          ))}
        </div>
      </section>

      <section>
        <label className="label text-lg font-semibold" htmlFor="links">
          Tautan & Lampiran
        </label>
        <textarea
          id="links"
          name="links"
          rows={3}
          defaultValue={report?.links ?? ""}
          placeholder={"- GitHub: https://github.com/…\n- Notebook: https://colab.research.google.com/…"}
          className="input resize-y"
        />
      </section>

      <p className="hint">
        Semua kolom mendukung Markdown: <code>- poin</code>, <code>**tebal**</code>, <code>[teks](link)</code>, dan rumus{" "}
        <code>$…$</code>.
      </p>

      <div className="flex items-center justify-end gap-2 border-t border-border pt-5">
        <Link href={cancelHref} className="btn btn-ghost">
          Batal
        </Link>
        <SubmitButton>{report ? "Simpan perubahan" : "Simpan laporan"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

function Field({
  number,
  section,
  defaultValue,
}: {
  number: number;
  section: { key: ReportField; label: string; hint: string };
  defaultValue?: string;
}) {
  return (
    <div>
      <label className="label flex gap-2" htmlFor={section.key}>
        <span className="text-muted tabular-nums">{number}.</span>
        {section.label}
      </label>
      <textarea
        id={section.key}
        name={section.key}
        rows={4}
        defaultValue={defaultValue ?? ""}
        placeholder={section.hint}
        className="input resize-y leading-6"
      />
    </div>
  );
}
