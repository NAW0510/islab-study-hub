import type { VocabDomain } from "@/lib/types";
import { domainPath, type DomainIndex } from "@/lib/vocab/format";
import { asDomainColor, DOMAIN_TONE_CLASS } from "@/lib/vocab/seed-domains";
import { cn } from "@/lib/utils";

/** Tinted chip for a domain; the neutral "tanpa domain" chip when `domain` is null. */
export function DomainChip({
  domain,
  domains,
  className,
  onClick,
}: {
  domain: VocabDomain | null;
  /** When given, the label shows the full path ("Deep Learning › ML"). */
  domains?: DomainIndex;
  className?: string;
  onClick?: () => void;
}) {
  const label = domain ? (domains ? domainPath(domain.id, domains) : domain.name) : "Tanpa domain";
  const tone = DOMAIN_TONE_CLASS[asDomainColor(domain?.color)];
  const chip = cn("chip chip-tone max-w-full", tone, className);
  return onClick ? (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={cn(chip, "cursor-pointer hover:opacity-80")}>
      <span className="truncate">{label}</span>
    </button>
  ) : (
    <span className={chip} title={label}>
      <span className="truncate">{label}</span>
    </span>
  );
}
