"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ClipboardList, GraduationCap, LayoutDashboard, Library, LogOut, NotebookPen } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", short: "Beranda", icon: LayoutDashboard },
  { href: "/subjects", label: "Subjek & Silabus", short: "Silabus", icon: BookOpen },
  { href: "/notes", label: "Catatan", short: "Catatan", icon: NotebookPen },
  { href: "/resources", label: "Sumber Belajar", short: "Sumber", icon: Library },
  { href: "/reports", label: "Laporan Mingguan", short: "Laporan", icon: ClipboardList },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-fg">
        <GraduationCap className="size-4.5" />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold">{APP_NAME}</span>
        <span className="block text-xs text-muted">ML & Data Science</span>
      </span>
    </Link>
  );
}

function SignOutButton({ compact = false }: { compact?: boolean }) {
  return (
    <form action="/auth/signout" method="post">
      <button
        type="submit"
        className={compact ? "icon-btn" : "btn btn-ghost btn-sm w-full justify-start"}
        title="Keluar"
        aria-label="Keluar"
      >
        <LogOut className="size-4" />
        {!compact && "Keluar"}
      </button>
    </form>
  );
}

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-surface px-4 py-5 md:flex print:!hidden">
        <div className="px-2">
          <Brand />
        </div>
        <nav className="mt-8 flex flex-col gap-0.5" aria-label="Navigasi utama">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              prefetch
              aria-current={isActive(pathname, href) ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                isActive(pathname, href)
                  ? "bg-accent-soft text-accent"
                  : "text-muted hover:bg-surface-2 hover:text-text",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-border pt-4">
          <p className="truncate px-2.5 pb-2 text-xs text-muted" title={email}>
            {email}
          </p>
          <SignOutButton />
        </div>
      </aside>

      {/* Mobile */}
      <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur md:hidden print:!hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Brand />
          <SignOutButton compact />
        </div>
        <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-2" aria-label="Navigasi utama">
          {NAV.map(({ href, short, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              prefetch
              aria-current={isActive(pathname, href) ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
                isActive(pathname, href) ? "bg-accent-soft text-accent" : "text-muted",
              )}
            >
              <Icon className="size-3.5" />
              {short}
            </Link>
          ))}
        </nav>
      </header>
    </>
  );
}
