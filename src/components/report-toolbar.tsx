"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, Copy, FileDown, FileText, Link2, Loader2, MessageSquareText, Pencil, Send, Undo2, X } from "lucide-react";
import { deleteReport, disableShare, enableShare, setReportStatus } from "@/lib/actions/reports";
import { callAction } from "@/lib/call-action";
import { copyText } from "@/lib/copy-text";
import type { ReportStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DeleteButton } from "./action-buttons";

function useFlash() {
  const [flash, setFlash] = useState<string | null>(null);
  return {
    flash,
    show(message: string) {
      setFlash(message);
      window.setTimeout(() => setFlash(null), 2200);
    },
  };
}

/** PDF (browser print → "Save as PDF") + Word download. Shared by the owner view and the public link. */
export function ExportButtons({ docxHref }: { docxHref: string }) {
  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
        <FileDown className="size-4" /> PDF
      </button>
      <a href={docxHref} className="btn btn-secondary">
        <FileText className="size-4" /> Word
      </a>
    </>
  );
}

export function ReportToolbar({
  reportId,
  status,
  shareToken,
  origin,
  chatText,
  weekLabel,
}: {
  reportId: string;
  status: ReportStatus;
  shareToken: string | null;
  origin: string;
  chatText: string;
  weekLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  const { flash, show } = useFlash();

  return (
    <div className="mb-6 space-y-3 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/reports/${reportId}/edit`} className="btn btn-primary">
          <Pencil className="size-4" /> Edit
        </Link>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={async () => show((await copyText(chatText)) ? "Teks laporan disalin — tinggal tempel di chat mentor." : "Gagal menyalin.")}
        >
          <MessageSquareText className="size-4" /> Salin untuk chat
        </button>
        <ExportButtons docxHref={`/reports/${reportId}/docx`} />
        <button
          type="button"
          disabled={pending}
          className={cn("btn", status === "sent" ? "btn-ghost" : "btn-secondary")}
          onClick={() =>
            startTransition(async () => {
              const result = await callAction(() => setReportStatus(reportId, status === "sent" ? "draft" : "sent"));
              if (result?.error) window.alert(result.error);
            })
          }
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : status === "sent" ? (
            <Undo2 className="size-4" />
          ) : (
            <Send className="size-4" />
          )}
          {status === "sent" ? "Kembalikan ke draft" : "Tandai sudah dikirim"}
        </button>
        <div className="ml-auto">
          <DeleteButton
            action={deleteReport.bind(null, reportId)}
            confirmText={`Hapus laporan ${weekLabel}? Link berbagi (jika ada) juga ikut mati.`}
          />
        </div>
      </div>

      <SharePanel reportId={reportId} initialToken={shareToken} origin={origin} onCopied={show} />

      {flash && (
        <p role="status" className="flex items-center gap-1.5 text-sm text-accent">
          <Check className="size-4" /> {flash}
        </p>
      )}
    </div>
  );
}

function SharePanel({
  reportId,
  initialToken,
  origin,
  onCopied,
}: {
  reportId: string;
  initialToken: string | null;
  origin: string;
  onCopied: (message: string) => void;
}) {
  const [token, setToken] = useState(initialToken);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const url = token ? `${origin}/r/${token}` : null;
  const isLocal = /\/\/(localhost|127\.0\.0\.1|192\.168\.|10\.|\[::1\])/.test(origin);

  return (
    <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
            url ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted",
          )}
        >
          <Link2 className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{url ? "Link berbagi aktif" : "Bagikan laporan"}</p>
          {url ? (
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="input mt-1.5 font-mono text-xs"
              aria-label="Link berbagi"
            />
          ) : (
            <p className="text-xs text-muted">
              Siapa pun yang punya link bisa membaca & mengunduh laporan ini tanpa login. Bisa dimatikan kapan saja.
            </p>
          )}
          {url && isLocal && (
            <p className="mt-1.5 text-xs text-muted">
              Catatan: alamat ini masih alamat lokal. Setelah deploy ke Vercel, link otomatis memakai domainmu.
            </p>
          )}
          {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        {url ? (
          <>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={async () => onCopied((await copyText(url)) ? "Link disalin." : "Gagal menyalin link.")}
            >
              <Copy className="size-3.5" /> Salin link
            </button>
            <button
              type="button"
              disabled={pending}
              className="btn btn-ghost btn-sm"
              onClick={() =>
                startTransition(async () => {
                  const result = await callAction(() => disableShare(reportId));
                  if (result?.error) setError(result.error);
                  else setToken(null);
                })
              }
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />} Matikan
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={pending}
            className="btn btn-secondary btn-sm"
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await callAction(() => enableShare(reportId));
                if ("token" in result && result.token) {
                  setToken(result.token);
                  onCopied((await copyText(`${origin}/r/${result.token}`)) ? "Link dibuat dan disalin." : "Link dibuat.");
                } else {
                  setError(result.error ?? "Gagal membuat link.");
                }
              })
            }
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />} Buat link
          </button>
        )}
      </div>
    </div>
  );
}
