import Link from "next/link";
import { SlideGroup } from "../../slide-group";

const VIEWS = [
  { key: "2d", href: "/vocab/map", label: "2D", title: "Peta datar dengan wilayah per bidang" },
  { key: "3d", href: "/vocab/map/3d", label: "3D", title: "Ruang tiga dimensi yang bisa diputar" },
] as const;

/** The 2D/3D switch of the Peta Otak, in the top bar's second row (navbar.tsx). */
export function MapViewSwitch({ active }: { active: (typeof VIEWS)[number]["key"] }) {
  return (
    <nav aria-label="Tampilan Peta Otak">
      <SlideGroup className="segmented segmented-sm">
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
      </SlideGroup>
    </nav>
  );
}
