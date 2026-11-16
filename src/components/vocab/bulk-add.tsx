"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { ClipboardPaste, Loader2, TriangleAlert } from "lucide-react";
import { createTermsBulk } from "@/lib/actions/vocab";
import { callAction } from "@/lib/call-action";
import { cn, todayISO } from "@/lib/utils";
import { BULK_MAX_LINES, BULK_WARNING_LABELS, parseBulk } from "@/lib/vocab/parse-bulk";
import { useToast } from "../toast";

/** Paste many terms at once, with a preview table before anything is saved. */
export function BulkAdd({ existing, onSaved }: { existing: string[]; onSaved: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState("");
  const [learnedOn, setLearnedOn] = useState(todayISO());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const preview = useMemo(() => parseBulk(text, existing), [text, existing]);
  const savable = preview.rows.filter((r) => r.ok).length;

  function close() {
    dialogRef.current?.close();
    setText("");
    setError(null);
  }

  function save() {
    const formData = new FormData();
    formData.set("lines", text);
    formData.set("learned_on", learnedOn);
    startTransition(async () => {
      const result = await callAction(() => createTermsBulk(formData));
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      close();
      toast({
        message:
          `${result.inserted} istilah disimpan` +
          (result.skipped > 0 ? `, ${result.skipped} dilewati` : "") +
          (result.embed === "failed" ? " — klasifikasi tertunda" : ""),
      });
      onSaved();
    });
  }

  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={() => dialogRef.current?.showModal()}>
        <ClipboardPaste className="size-4" /> Tempel banyak
      </button>

      <dialog
        ref={dialogRef}
        className="m-auto w-[min(44rem,calc(100vw-2rem))] rounded-panel border border-border bg-surface p-5 text-text shadow-xl backdrop:bg-black/40"
        onClick={(e) => e.target === e.currentTarget && close()}
      >
        <h2 className="font-display text-lg font-semibold tracking-tight">Tempel banyak istilah</h2>
        <p className="mt-1 text-sm text-muted">
          Satu istilah per baris. Pemisah definisi: tab, “ — ”, “ – ”, “ - ”, atau “: ”. Maksimal {BULK_MAX_LINES} baris;
          semuanya dikirim sebagai satu batch klasifikasi.
        </p>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          placeholder={"tensor — struktur data multidimensi\noverfitting: model terlalu menghafal data latih"}
          aria-label="Baris istilah"
          className="input mt-3 font-mono text-[13px]"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="text-sm text-muted" htmlFor="bulk-learned">
            Tanggal belajar
          </label>
          <input
            id="bulk-learned"
            type="date"
            value={learnedOn}
            onChange={(e) => setLearnedOn(e.target.value)}
            className="input w-auto"
          />
        </div>

        {preview.rows.length > 0 && (
          <div className="mt-4 max-h-64 overflow-y-auto rounded-card border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-2 text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Istilah</th>
                  <th className="px-3 py-2 font-medium">Definisi</th>
                  <th className="px-3 py-2 font-medium">Catatan</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.line} className={cn("border-t border-border", !row.ok && "opacity-60")}>
                    <td className="max-w-40 truncate px-3 py-1.5 font-medium">{row.term}</td>
                    <td className="max-w-64 truncate px-3 py-1.5 text-muted">{row.definition || "—"}</td>
                    <td className="px-3 py-1.5 text-xs">
                      {row.warnings.length === 0 ? (
                        <span className="text-success">Siap</span>
                      ) : (
                        <span className={cn("inline-flex items-center gap-1", row.ok ? "text-muted" : "text-danger")}>
                          <TriangleAlert className="size-3.5 shrink-0" />
                          {row.warnings.map((w) => BULK_WARNING_LABELS[w]).join("; ")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {preview.overflow > 0 && (
          <p className="mt-2 text-xs text-danger">{preview.overflow} baris melebihi batas dan tidak akan disimpan.</p>
        )}
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={close}>
            Batal
          </button>
          <button type="button" className="btn btn-primary" disabled={pending || savable === 0} onClick={save}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Simpan {savable} istilah
          </button>
        </div>
      </dialog>
    </>
  );
}
