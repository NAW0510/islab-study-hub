import { GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Kept apart from parts.tsx so pages without the shell (login, shared
 * reports) do not pull in next/link just for the logo.
 */
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
