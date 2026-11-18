import type { ShapeColor, ShapeKind } from "@/components/shape";

type NavItem = { href: string; label: string; short: string; shape: ShapeKind; color: ShapeColor };

/**
 * Main navigation, in order. The position (01, 02, …) is shown next to each
 * label, and every section has its own Bauhaus shape and colour, used in the
 * navigation, its page headers and its empty states. `short` is the label in
 * the top bar, where six sections share one line.
 */
export const NAV_ITEMS = [
  { href: "/", label: "Dashboard", short: "Dashboard", shape: "circle", color: "blue" },
  { href: "/subjects", label: "Subjek & Silabus", short: "Subjek", shape: "square", color: "green" },
  { href: "/notes", label: "Catatan", short: "Catatan", shape: "triangle", color: "red" },
  { href: "/vocab", label: "Kosakata", short: "Kosakata", shape: "plus", color: "yellow" },
  { href: "/resources", label: "Sumber Belajar", short: "Sumber", shape: "half", color: "blue" },
  { href: "/reports", label: "Laporan Mingguan", short: "Laporan", shape: "x", color: "red" },
] as const satisfies readonly NavItem[];

export function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** The section a path belongs to (Dashboard for anything unknown). */
export function sectionOf(pathname: string): NavItem {
  return NAV_ITEMS.find((item) => item.href !== "/" && isActivePath(pathname, item.href)) ?? NAV_ITEMS[0];
}

/** "01", "02", … */
export function navNumber(index: number) {
  return String(index + 1).padStart(2, "0");
}

/** Pages drawn over a full-screen world: the top bar turns nearly clear there. */
const IMMERSIVE = ["/vocab/perpustakaan", "/vocab/map"];

export function isImmersive(pathname: string) {
  return IMMERSIVE.some((p) => isActivePath(pathname, p));
}

export type VocabTab = "list" | "library" | "map" | "domains";

/**
 * What the top bar's second row shows for a page, read from its path alone
 * (so it renders on the server and stays put between the pages it serves):
 * the Kosakata tabs on every Kosakata page, and the 2D/3D switch on the
 * Peta Otak. Switches that hold a page's own state come through the page's
 * slot instead (nav-slot.tsx). Null: nothing from the route.
 */
export function subNavFor(pathname: string): { vocab: VocabTab; map?: "2d" | "3d" } | null {
  if (!isActivePath(pathname, "/vocab")) return null;
  if (isActivePath(pathname, "/vocab/perpustakaan")) return { vocab: "library" };
  if (isActivePath(pathname, "/vocab/domains")) return { vocab: "domains" };
  if (isActivePath(pathname, "/vocab/map")) return { vocab: "map", map: isActivePath(pathname, "/vocab/map/3d") ? "3d" : "2d" };
  return { vocab: "list" };
}
