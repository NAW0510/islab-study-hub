"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { saveProfile } from "@/lib/actions/reports";
import { DEFAULT_PROGRAM_START } from "@/lib/report-template";
import type { Profile } from "@/lib/types";
import { ActionForm, SubmitButton } from "./action-form";

export function ProfileForm({ profile }: { profile: Profile | null }) {
  const [saved, setSaved] = useState(false);

  return (
    <ActionForm
      action={saveProfile}
      onSuccess={() => {
        setSaved(true);
        window.setTimeout(() => setSaved(false), 2500);
      }}
      className="grid gap-4 sm:grid-cols-2"
    >
      <div>
        <label className="label" htmlFor="full_name">
          Nama lengkap
        </label>
        <input id="full_name" name="full_name" defaultValue={profile?.full_name ?? ""} className="input" />
      </div>
      <div className="grid grid-cols-[6rem_1fr] gap-3">
        <div>
          <label className="label" htmlFor="group_number">
            Kelompok
          </label>
          <input
            id="group_number"
            name="group_number"
            defaultValue={profile?.group_number ?? ""}
            placeholder="3"
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="group_name">
            Nama kelompok
          </label>
          <input
            id="group_name"
            name="group_name"
            defaultValue={profile?.group_name ?? ""}
            placeholder="opsional"
            className="input"
          />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="mentor_name">
          Mentor
        </label>
        <input
          id="mentor_name"
          name="mentor_name"
          defaultValue={profile?.mentor_name ?? ""}
          placeholder="opsional"
          className="input"
        />
      </div>
      <div>
        <label className="label" htmlFor="program_start">
          Tanggal mulai Week 1
        </label>
        <input
          id="program_start"
          name="program_start"
          type="date"
          required
          defaultValue={profile?.program_start ?? DEFAULT_PROGRAM_START}
          className="input"
        />
      </div>
      <div className="flex items-center justify-end gap-3 sm:col-span-2">
        {saved && (
          <span role="status" className="inline-flex items-center gap-1 text-sm text-accent">
            <Check className="size-4" /> Tersimpan
          </span>
        )}
        <SubmitButton className="btn-sm">Simpan identitas</SubmitButton>
      </div>
    </ActionForm>
  );
}
