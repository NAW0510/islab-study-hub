"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const ACCENTS = [
  { key: "biru", label: "Biru (usulan)" },
  { key: "teal", label: "Teal (sekarang)" },
] as const;

type Accent = (typeof ACCENTS)[number]["key"];

/** Wraps the preview in the proposed theme and lets you compare accent colours. */
export function Playground({ fontClassName, children }: { fontClassName: string; children: ReactNode }) {
  const [accent, setAccent] = useState<Accent>("biru");

  return (
    <div data-accent={accent} className={fontClassName}>
      <div className="theme-next min-h-dvh bg-bg text-text">
        <div className="sticky top-0 z-10 border-b border-border bg-bg/90 backdrop-blur">
          <div className="mx-auto flex max-w-[110rem] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-8">
            <span className="eyebrow">Aksen</span>
            <div className="flex gap-1 rounded-full border border-border bg-surface p-1" role="group" aria-label="Warna aksen">
              {ACCENTS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={accent === option.key}
                  onClick={() => setAccent(option.key)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    accent === option.key ? "bg-primary text-primary-fg" : "text-muted hover:text-text",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted">Hanya memengaruhi tautan, nav aktif, fokus, dan progres.</span>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
