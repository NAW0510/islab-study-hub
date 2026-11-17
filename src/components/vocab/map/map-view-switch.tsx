import Link from "next/link";
import { cn } from "@/lib/utils";

const VIEWS = [
  { key: "2d", href: "/vocab/map", label: "2D", title: "Peta datar dengan wilayah per bidang" },
  { key: "3d", href: "/vocab/map/3d", label: "3D", title: "Ruang tiga dimensi yang bisa diputar" },
] as const;

/** Segmented switch between the two brain map views. */
export function MapViewSwitch({ active }: { active: (typeof VIEWS)[number]["key"] }) {
  return (
    <nav aria-label="Tampilan Peta Otak" className="inline-flex rounded-btn border border-border-strong bg-surface p-0.5">
      {VIEWS.map((view) => (
        <Link
          key={view.key}
          href={view.href}
          title={view.title}
          aria-current={view.key === active ? "page" : undefined}
          className={cn(
            "inline-flex h-9 min-w-14 items-center justify-center rounded-btn px-4 text-sm font-medium transition-colors",
            view.key === active ? "bg-primary text-primary-fg" : "text-muted hover:text-text",
          )}
        >
          {view.label}
        </Link>
      ))}
    </nav>
  );
}
