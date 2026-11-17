import Link from "next/link";
import { LogOut } from "lucide-react";
import { Shape } from "@/components/shape";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { BrandMark } from "./brand-mark";

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-3 rounded-control">
      <BrandMark />
      <span className="leading-tight">
        <span className="block font-display text-[1.0625rem] font-semibold tracking-tight">{APP_NAME}</span>
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
      className={cn(
        "chip h-[1.875rem] border border-border-strong bg-surface px-3 text-[13px] font-semibold text-text hover:bg-surface-2",
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
