"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { GitMerge, Loader2, Pencil, Plus, Sparkles } from "lucide-react";
import { createDomain, deleteDomain, mergeDomains, reclassifyAuto, updateDomain } from "@/lib/actions/vocab";
import { callAction } from "@/lib/call-action";
import type { ActionResult, VocabDomain } from "@/lib/types";
import { cn } from "@/lib/utils";
import { asDomainColor, DOMAIN_COLOR_LABELS, DOMAIN_COLORS, DOMAIN_TONE_CLASS } from "@/lib/vocab/seed-domains";
import { ActionForm, SubmitButton } from "../action-form";
import { DeleteButton } from "../action-buttons";
import { PageHeader } from "../ui";
import { useToast } from "../toast";
import { DomainChip } from "./domain-chip";
import { VocabTabs } from "./vocab-tabs";

/** Manage fields and branches: edit, merge, delete, reclassify (spec §3.5). */
export function DomainManager({ domains, termCounts }: { domains: VocabDomain[]; termCounts: Record<string, number> }) {
  const router = useRouter();
  const toast = useToast();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState<VocabDomain | null>(null);
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();

  const fields = domains.filter((d) => !d.parent_id);
  const branchesOf = (id: string) => domains.filter((d) => d.parent_id === id);
  const refresh = () => router.refresh();

  function openForm(domain: VocabDomain | null) {
    setEditing(domain);
    setCreating(domain === null);
    dialogRef.current?.showModal();
  }

  function closeForm() {
    dialogRef.current?.close();
    setEditing(null);
    setCreating(false);
  }

  const run = (action: () => Promise<ActionResult>, done: string) =>
    startTransition(async () => {
      const result = await callAction(action);
      toast({ message: result?.error ?? done });
      refresh();
    });

  return (
    <>
      <PageHeader
        title="Kelola domain"
        description="Deskripsi domain dipakai untuk klasifikasi: sistem membandingkan istilah baru dengan teks “nama: deskripsi + contoh istilah”. Maksimal dua tingkat (bidang › cabang)."
        actions={
          <>
            <button
              type="button"
              disabled={pending}
              className="btn btn-secondary"
              title="Jalankan ulang tebakan untuk istilah pending dan otomatis. Pilihanmu sendiri tidak disentuh."
              onClick={() => run(async () => { const r = await reclassifyAuto(); return "error" in r ? r : undefined; }, "Klasifikasi ulang selesai.")}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              Klasifikasi ulang yang otomatis
            </button>
            <button type="button" className="btn btn-primary" onClick={() => openForm(null)}>
              <Plus className="size-4" /> Domain baru
            </button>
          </>
        }
      />
      <VocabTabs active="domains" />

      {fields.length === 0 ? (
        <p className="card px-4 py-8 text-center text-sm text-muted">Belum ada domain.</p>
      ) : (
        <ul className="space-y-3">
          {fields.map((field) => (
            <li key={field.id} className="card">
              <DomainRow domain={field} domains={domains} count={termCounts[field.id] ?? 0} onEdit={openForm} onMerge={run} />
              {branchesOf(field.id).map((branch) => (
                <div key={branch.id} className="border-t border-border pl-6">
                  <DomainRow domain={branch} domains={domains} count={termCounts[branch.id] ?? 0} onEdit={openForm} onMerge={run} />
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}

      <dialog
        ref={dialogRef}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-panel border border-border bg-surface p-5 text-text shadow-xl backdrop:bg-black/40"
        onClose={closeForm}
        onClick={(e) => e.target === e.currentTarget && closeForm()}
      >
        {(creating || editing) && (
          <DomainForm key={editing?.id ?? "new"} domain={editing} fields={fields} onDone={() => { closeForm(); refresh(); }} />
        )}
      </dialog>
    </>
  );
}

function DomainRow({
  domain,
  domains,
  count,
  onEdit,
  onMerge,
}: {
  domain: VocabDomain;
  domains: VocabDomain[];
  count: number;
  onEdit: (domain: VocabDomain) => void;
  onMerge: (action: () => Promise<ActionResult>, done: string) => void;
}) {
  const [mergeTarget, setMergeTarget] = useState("");
  const targets = domains.filter((d) => d.id !== domain.id);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <DomainChip domain={domain} />
      <span className="text-xs text-muted tabular-nums">{count} istilah</span>
      <p className="w-full text-sm text-muted sm:w-auto sm:flex-1 sm:truncate" title={domain.description}>
        {domain.description || <span className="italic">Tanpa deskripsi — klasifikasi untuk domain ini lemah.</span>}
      </p>
      <span className="ml-auto flex items-center gap-1.5">
        <select
          aria-label={`Gabungkan ${domain.name} ke`}
          value={mergeTarget}
          onChange={(e) => setMergeTarget(e.target.value)}
          className="input h-8 w-auto py-0 text-xs"
        >
          <option value="">Gabung ke…</option>
          {targets.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        {mergeTarget && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              const target = domains.find((d) => d.id === mergeTarget);
              if (window.confirm(`Pindahkan semua istilah “${domain.name}” ke “${target?.name}”, lalu hapus “${domain.name}”?`)) {
                onMerge(() => mergeDomains(domain.id, mergeTarget), "Domain digabung.");
                setMergeTarget("");
              }
            }}
          >
            <GitMerge className="size-3.5" /> Gabung
          </button>
        )}
        <button type="button" className="icon-btn" aria-label={`Ubah ${domain.name}`} onClick={() => onEdit(domain)}>
          <Pencil className="size-4" />
        </button>
        <DeleteButton
          action={() => deleteDomain(domain.id)}
          confirmText={`Hapus domain “${domain.name}”? ${count} istilah di dalamnya akan kembali menunggu domain, dan cabangnya menjadi bidang.`}
          iconOnly
        />
      </span>
    </div>
  );
}

function DomainForm({ domain, fields, onDone }: { domain: VocabDomain | null; fields: VocabDomain[]; onDone: () => void }) {
  const [color, setColor] = useState(asDomainColor(domain?.color ?? "domain-1"));
  const parentChoices = fields.filter((f) => f.id !== domain?.id);

  return (
    <ActionForm action={domain ? updateDomain.bind(null, domain.id) : createDomain} onSuccess={onDone}>
      <h2 className="font-display text-lg font-semibold tracking-tight">{domain ? `Ubah ${domain.name}` : "Domain baru"}</h2>
      <div className="mt-4 space-y-3">
        <div>
          <label className="label" htmlFor="dm-name">
            Nama
          </label>
          <input id="dm-name" name="name" defaultValue={domain?.name} required maxLength={60} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="dm-desc">
            Deskripsi
          </label>
          <textarea id="dm-desc" name="description" defaultValue={domain?.description} rows={2} maxLength={1000} className="input" />
          <p className="hint">Dipakai untuk klasifikasi. Sebutkan kata kunci khas domain ini.</p>
        </div>
        <div>
          <span className="label">Warna</span>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Warna domain">
            {DOMAIN_COLORS.filter((c) => c !== "domain-none").map((c) => (
              <label key={c} className="cursor-pointer" title={DOMAIN_COLOR_LABELS[c]}>
                <input
                  type="radio"
                  name="color"
                  value={c}
                  checked={color === c}
                  onChange={() => setColor(c)}
                  className="sr-only"
                />
                <span
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full border-2",
                    color === c ? "border-text" : "border-transparent",
                  )}
                >
                  <span className={cn("chip-tone size-4 rounded-full border-0 p-0", DOMAIN_TONE_CLASS[c])} style={{ backgroundColor: `var(--${c})` }} />
                </span>
                <span className="sr-only">{DOMAIN_COLOR_LABELS[c]}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="dm-parent">
            Induk
          </label>
          <select id="dm-parent" name="parent_id" defaultValue={domain?.parent_id ?? ""} className="input">
            <option value="">— Bidang (tanpa induk) —</option>
            {parentChoices.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <p className="hint">Domain yang sudah punya cabang tidak bisa dijadikan cabang.</p>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Batal
        </button>
        <SubmitButton>{domain ? "Simpan perubahan" : "Buat domain"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
