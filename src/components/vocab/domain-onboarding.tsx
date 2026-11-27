"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Compass } from "lucide-react";
import { seedDomains } from "@/lib/actions/vocab";
import { cn } from "@/lib/utils";
import { DOMAIN_TONE_CLASS, SEED_DOMAINS } from "@/lib/vocab/seed-domains";
import { ActionForm, SubmitButton } from "../action-form";
import { PageHeader } from "../ui";

/** First run: pick starter domains (every field editable) or start from scratch. */
export function DomainOnboarding() {
  const router = useRouter();
  const [picked, setPicked] = useState(() => new Set(SEED_DOMAINS.filter((d) => d.selected).map((d) => d.key)));

  return (
    <>
      <PageHeader
        title="Istilah Teknis"
        description="Glosarium pribadimu. Sebelum mulai, siapkan bidang dan cabang ilmunya — deskripsi tiap domain dipakai sistem untuk menebak domain istilah baru, jadi tulis kata-kata kunci yang khas."
      />
      <ActionForm action={seedDomains} className="max-w-3xl" onSuccess={() => router.refresh()}>
        <ul className="card divide-y divide-border">
          {SEED_DOMAINS.map((seed) => {
            const on = picked.has(seed.key);
            return (
              <li key={seed.key} className={cn("flex gap-3 px-4 py-3", !on && "opacity-50")}>
                <input
                  type="checkbox"
                  name={`pick-${seed.key}`}
                  checked={on}
                  onChange={(e) => {
                    const next = new Set(picked);
                    if (e.target.checked) next.add(seed.key);
                    else next.delete(seed.key);
                    setPicked(next);
                  }}
                  className="mt-2.5 size-4 shrink-0 accent-(--accent)"
                  aria-label={`Pakai domain ${seed.name}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("chip chip-tone", DOMAIN_TONE_CLASS[seed.color as keyof typeof DOMAIN_TONE_CLASS])} />
                    <input
                      name={`name-${seed.key}`}
                      defaultValue={seed.name}
                      maxLength={60}
                      aria-label={`Nama domain ${seed.name}`}
                      className="input h-8 w-auto min-w-40 flex-1 text-sm font-medium"
                      disabled={!on}
                    />
                    {seed.parent && <span className="text-xs text-muted">cabang dari {SEED_DOMAINS.find((d) => d.key === seed.parent)?.name}</span>}
                  </div>
                  <textarea
                    name={`desc-${seed.key}`}
                    defaultValue={seed.description}
                    rows={1}
                    aria-label={`Deskripsi domain ${seed.name}`}
                    className="input mt-1.5 min-h-8 py-1 text-sm"
                    disabled={!on}
                  />
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <SubmitButton>
            <Compass className="size-4" /> Simpan {picked.size} domain
          </SubmitButton>
          <p className="text-sm text-muted">Bisa diubah, digabung, atau ditambah kapan saja lewat “Kelola domain”.</p>
        </div>
      </ActionForm>
    </>
  );
}
