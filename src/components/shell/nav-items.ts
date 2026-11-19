import type { ShapeColor, ShapeKind } from "@/components/shape";

type NavItem = { href: string; label: string; shape: ShapeKind; color: ShapeColor };

/**
 * Main navigation, in order. The position (01, 02, …) is shown next to each
 * label, and every section has its own Bauhaus shape and colour, used in the
 * navigation, its page headers and its empty states.
 */
export const NAV_ITEMS = [
  { href: "/", label: "Dashboard", shape: "circle", color: "blue" },
  { href: "/subjects", label: "Subjek & Silabus", shape: "square", color: "green" },
  { href: "/notes", label: "Catatan", shape: "triangle", color: "red" },
  { href: "/vocab", label: "Kosakata", shape: "plus", color: "yellow" },
  { href: "/resources", label: "Sumber Belajar", shape: "half", color: "blue" },
  { href: "/reports", label: "Laporan Mingguan", shape: "x", color: "red" },
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
