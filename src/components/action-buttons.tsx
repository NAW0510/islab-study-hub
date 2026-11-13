"use client";

import { useOptimistic, useRef, useTransition } from "react";
import { Check, ChevronDown, Loader2, Trash2 } from "lucide-react";
import { callAction } from "@/lib/call-action";
import { STATUS_META, STATUSES } from "@/lib/constants";
import type { ActionResult, Status } from "@/lib/types";
import { cn } from "@/lib/utils";

function report(result: ActionResult) {
  if (result?.error) window.alert(result.error);
}

export function DeleteButton({
  action,
  confirmText,
  label = "Hapus",
  iconOnly = false,
  className,
}: {
  action: () => Promise<ActionResult>;
  confirmText: string;
  label?: string;
  iconOnly?: boolean;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        disabled={pending}
        title={label}
        aria-label={label}
        className={cn(iconOnly ? "icon-btn hover:text-danger" : "btn btn-danger", className)}
        onClick={() => dialogRef.current?.showModal()}
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
        {!iconOnly && label}
      </button>

      <dialog
        ref={dialogRef}
        className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-5 text-text shadow-xl backdrop:bg-black/40 backdrop:backdrop-blur-[2px]"
        onClick={(e) => e.target === e.currentTarget && dialogRef.current?.close()}
      >
        <div className="flex gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
            <Trash2 className="size-4" />
          </span>
          <p className="pt-1.5 text-sm">{confirmText}</p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" autoFocus className="btn btn-ghost" onClick={() => dialogRef.current?.close()}>
            Batal
          </button>
          <button
            type="button"
            className="btn bg-danger text-white hover:opacity-90 dark:text-black"
            onClick={() => {
              dialogRef.current?.close();
              startTransition(async () => report(await callAction(() => action())));
            }}
          >
            {label}
          </button>
        </div>
      </dialog>
    </>
  );
}

export function StatusSelect({
  value,
  action,
  className,
}: {
  value: Status;
  action: (status: Status) => Promise<ActionResult>;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useOptimistic(value);

  return (
    <span className={cn("relative inline-flex", pending && "opacity-70", className)}>
      <select
        aria-label="Status"
        value={status}
        onChange={(e) => {
          const next = e.target.value as Status;
          startTransition(async () => {
            setStatus(next);
            report(await callAction(() => action(next)));
          });
        }}
        className={cn(
          "cursor-pointer appearance-none rounded-full border-0 py-1 pr-7 pl-2.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
          STATUS_META[status].badge,
        )}
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_META[s].label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 opacity-70" />
    </span>
  );
}

/** Round checkbox: toggles between completed and not started. */
export function StatusCheck({
  value,
  action,
  label,
}: {
  value: Status;
  action: (status: Status) => Promise<ActionResult>;
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useOptimistic(value);
  const done = status === "completed";

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      title={done ? "Tandai belum selesai" : "Tandai selesai"}
      disabled={pending}
      onClick={() => {
        const next: Status = done ? "not_started" : "completed";
        startTransition(async () => {
          setStatus(next);
          report(await callAction(() => action(next)));
        });
      }}
      className={cn(
        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition",
        done
          ? "border-emerald-500 bg-emerald-500 text-white"
          : status === "in_progress"
            ? "border-amber-500 hover:bg-amber-500/10"
            : "border-border hover:border-muted",
      )}
    >
      {done && <Check className="size-3" strokeWidth={3} />}
    </button>
  );
}
