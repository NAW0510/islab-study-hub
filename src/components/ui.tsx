import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { STATUS_META, SUBJECT_COLORS } from "@/lib/constants";
import type { Status, SubjectRef } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Shape, type ShapeColor, type ShapeKind } from "./shape";

/**
 * A chapter mark for a section of a page: its shape, its number, a rule and
 * a small uppercase title (after labmgm.org's chapters). The number is
 * decoration, so screen readers hear the title only.
 */
export function ChapterTitle({
  id,
  number,
  shape,
  color,
  title,
  action,
}: {
  id?: string;
  number: string;
  shape: ShapeKind;
  color: ShapeColor;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex min-h-9 items-center justify-between gap-3">
      <h2
        id={id}
        className="flex min-w-0 items-center gap-2.5 text-xs font-semibold tracking-[0.14em] whitespace-nowrap text-muted uppercase sm:gap-3"
      >
        <Shape kind={shape} color={color} className="size-2.5" />
        <span aria-hidden="true" className="font-display tracking-[0.06em] text-text tabular-nums">
          {number}
        </span>
        <span aria-hidden="true" className="h-px w-4 shrink-0 bg-border-strong sm:w-7" />
        {title}
      </h2>
      {action}
    </div>
  );
}

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
        className={cn("progress-fill h-full w-full rounded-full bg-accent", barClassName)}
        // Slides in from the left (transform only), so a new value glides and the round end stays round.
        style={{ transform: `translateX(${Math.min(100, Math.max(0, value)) - 100}%)` }}
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
      <h3 className="font-display font-semibold tracking-tight">{title}</h3>
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
