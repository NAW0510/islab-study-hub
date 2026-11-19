import { Shape } from "@/components/shape";
import { cn } from "@/lib/utils";

/*
 * Kept apart from parts.tsx so pages without the shell (login, shared
 * reports) do not pull in next/link just for the logo.
 */
/**
 * The app's mark: four Bauhaus shapes in the four primaries, two by two.
 * Shared by the shell, the login page and shared reports.
 */
export function BrandMark({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const box = { sm: "size-7 gap-px", md: "size-[2.125rem] gap-0.5", lg: "size-12 gap-[3px]" }[size];
  return (
    <span aria-hidden="true" className={cn("grid shrink-0 grid-cols-2", box, className)}>
      <Shape kind="quarter" color="blue" className="size-full" />
      <Shape kind="circle" color="yellow" className="size-full" />
      <Shape kind="triangle" color="red" className="size-full" />
      <Shape kind="square" color="green" className="size-full" />
    </span>
  );
}
