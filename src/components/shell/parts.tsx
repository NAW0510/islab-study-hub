import Link from "next/link";
import { GraduationCap, LogOut } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** The app's mark: an ink tile with a cap. Shared by the shell, the login page and shared reports. */
export function BrandMark({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const box = { sm: "size-7", md: "size-8", lg: "size-12" }[size];
  const icon = { sm: "size-4", md: "size-4.5", lg: "size-6" }[size];
  return (
    <span
      aria-hidden="true"
      className={cn("flex shrink-0 items-center justify-center rounded-control bg-primary text-primary-fg", box, className)}
    >
      <GraduationCap className={icon} />
    </span>
  );
}

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <BrandMark />
      <span className="leading-tight">
        <span className="block font-display text-sm font-semibold tracking-tight">{APP_NAME}</span>
        <span className="block text-xs text-muted">ML &amp; Data Science</span>
      </span>
    </Link>
  );
}

/** Current programme week, e.g. "Week 07". Links to the weekly reports. */
export function WeekChip({ marker, period, className }: { marker: string; period: string; className?: string }) {
  return (
    <Link
      href="/reports"
      title={`${marker} · ${period}`}
      className={cn("chip border border-border bg-surface text-text hover:border-border-strong", className)}
    >
      <span className="size-1.5 rounded-full bg-accent" />
      <span className="font-display tracking-tight tabular-nums">{marker}</span>
    </Link>
  );
}

export function SignOutButton({ className }: { className?: string }) {
  return (
    <form action="/auth/signout" method="post">
      <button type="submit" className={cn("btn btn-ghost btn-sm", className)}>
        <LogOut className="size-4" />
        Keluar
      </button>
    </form>
  );
}
