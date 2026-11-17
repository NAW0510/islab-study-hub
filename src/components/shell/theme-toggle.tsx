"use client";

import { useRef, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { currentScheme, onSchemeChange, setScheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * Light or dark, pinned by hand (src/lib/theme.ts). The new scheme opens as
 * a circle from the button over the old one (after labmgm.org's theme wave);
 * with reduced motion, or without view transitions, it just changes.
 *
 * Before hydration the right icon comes from CSS (.theme-icon-*), so the
 * button never shows the wrong one; the pressed state follows once mounted.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const button = useRef<HTMLButtonElement>(null);
  const scheme = useSyncExternalStore(onSchemeChange, currentScheme, () => null);

  const toggle = () => {
    const next = currentScheme() === "dark" ? "light" : "dark";
    const root = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rect = button.current?.getBoundingClientRect();
    if (reduced || !rect || typeof document.startViewTransition !== "function") {
      setScheme(next);
      return;
    }
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    root.style.setProperty("--wave-x", `${x}px`);
    root.style.setProperty("--wave-y", `${y}px`);
    root.style.setProperty("--wave-r", `${Math.ceil(radius)}px`);
    root.dataset.vt = "theme";
    const transition = document.startViewTransition(() => setScheme(next));
    void transition.finished.finally(() => {
      delete root.dataset.vt;
      for (const name of ["--wave-x", "--wave-y", "--wave-r"]) root.style.removeProperty(name);
    });
  };

  return (
    <button
      ref={button}
      type="button"
      onClick={toggle}
      className={cn("icon-btn rounded-full border border-border-strong", className)}
      aria-label="Mode gelap"
      aria-pressed={scheme === null ? undefined : scheme === "dark"}
      title={scheme === "dark" ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
    >
      <Moon className="theme-icon-moon size-4" aria-hidden="true" />
      <Sun className="theme-icon-sun size-4" aria-hidden="true" />
    </button>
  );
}
