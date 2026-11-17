import Link from "next/link";

const VIEWS = [
  { key: "2d", href: "/vocab/map", label: "2D", title: "Peta datar dengan wilayah per bidang" },
  { key: "3d", href: "/vocab/map/3d", label: "3D", title: "Ruang tiga dimensi yang bisa diputar" },
] as const;

/** Segmented switch between the two brain map views. */
export function MapViewSwitch({ active }: { active: (typeof VIEWS)[number]["key"] }) {
  return (
    <nav aria-label="Tampilan Peta Otak" className="segmented">
      {VIEWS.map((view) => (
        <Link
          key={view.key}
          href={view.href}
          title={view.title}
          aria-current={view.key === active ? "page" : undefined}
          className="segmented-item"
        >
          {view.label}
        </Link>
      ))}
    </nav>
  );
}
