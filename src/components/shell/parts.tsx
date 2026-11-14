import Link from "next/link";
import { GraduationCap, LogOut } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-control bg-primary text-primary-fg">
        <GraduationCap className="size-4.5" />
      </span>
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
