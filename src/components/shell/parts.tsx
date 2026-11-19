import Link from "next/link";
import { LogOut } from "lucide-react";
import { Shape } from "@/components/shape";
import { cn } from "@/lib/utils";

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

/**
 * The account in the top bar: the email's initial in a circle, opening a
 * small native popover (Esc and a click outside close it) with the email and
 * "Keluar". The bar's own right edge is where it opens, so it needs no anchor.
 */
export function AccountMenu({ email, className }: { email: string; className?: string }) {
  const initial = (email.trim()[0] ?? "?").toUpperCase();
  return (
    <>
      <button
        type="button"
        popoverTarget="account-menu"
        className={cn("account-btn", className)}
        aria-label="Akun"
        title={email}
      >
        <span aria-hidden="true">{initial}</span>
      </button>
      <div id="account-menu" popover="auto" className="account-menu">
        <p className="eyebrow">Akun</p>
        <p className="mt-1.5 truncate text-sm text-text" title={email}>
          {email}
        </p>
        <div className="-mx-2 mt-3 border-t border-border pt-2">
          <SignOutButton />
        </div>
      </div>
    </>
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
