import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { STATUS_META, SUBJECT_COLORS } from "@/lib/constants";
import type { Status, SubjectRef } from "@/lib/types";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2 text-sm text-muted">{eyebrow}</div>}
        <h1 className="display text-[clamp(1.75rem,1.3rem+2vw,2.5rem)] text-balance">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function SubjectChip({ subject, link = true }: { subject: SubjectRef; link?: boolean }) {
  const color = SUBJECT_COLORS[subject.color] ?? SUBJECT_COLORS.teal;
  // The coloured dot comes from `.chip-tone` itself.
  const content = <span className="max-w-48 truncate">{subject.title}</span>;
  return link ? (
    <Link href={`/subjects/${subject.id}`} className={cn("chip hover:opacity-80", color.soft)}>
      {content}
    </Link>
  ) : (
    <span className={cn("chip", color.soft)}>{content}</span>
  );
}

export function StatusBadge({ status }: { status: Status }) {
  return <span className={cn("chip", STATUS_META[status].badge)}>{STATUS_META[status].label}</span>;
}

export function ProgressBar({ value, className, barClassName }: { value: number; className?: string; barClassName?: string }) {
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-2", className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full bg-accent transition-[width]", barClassName)}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("card flex flex-col items-center px-6 py-12 text-center", className)}>
      <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Icon className="size-5" />
      </div>
      <h3 className="font-medium">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Tag({ tag, href }: { tag: string; href?: string }) {
  const className = "chip bg-surface-2 text-muted";
  return href ? (
    <Link href={href} className={cn(className, "hover:text-text")}>
      #{tag}
    </Link>
  ) : (
    <span className={className}>#{tag}</span>
  );
}
