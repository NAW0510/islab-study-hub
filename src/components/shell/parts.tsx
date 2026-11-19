import Link from "next/link";
import { LogOut } from "lucide-react";
import { Shape } from "@/components/shape";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { BrandMark } from "./brand-mark";

/** The mark and the name. `compact` (the phone bar): one line, no subtitle. */
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className={cn("flex min-w-0 items-center rounded-control", compact ? "gap-2.5" : "gap-3")}>
      <BrandMark size={compact ? "sm" : "md"} />
      <span className="min-w-0 leading-tight">
        <span
          className={cn(
            "block font-display font-semibold tracking-tight whitespace-nowrap",
            compact ? "text-[0.9375rem]" : "text-[1.0625rem]",
          )}
        >
          {APP_NAME}
        </span>
        {!compact && <span className="block text-xs text-muted">ML &amp; Data Science</span>}
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
      className={cn(
        "chip h-[1.875rem] shrink-0 border border-border-strong bg-surface px-3 text-[13px] font-semibold whitespace-nowrap text-text hover:bg-surface-2",
        className,
      )}
    >
      <Shape kind="circle" color="blue" className="size-2" />
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
