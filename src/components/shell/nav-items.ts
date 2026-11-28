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
  { href: "/studi", label: "Ruang Studi", short: "Ruang Studi", shape: "plus", color: "yellow" },
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

/** Pages drawn over a full-screen world (the Perpustakaan, every Peta Otak view): the top bar turns nearly clear there. */
export function isImmersive(pathname: string) {
  return pathname === "/studi" || isActivePath(pathname, "/studi/istilah/peta");
}

/** The Perpustakaan's books whose own pages hang off them. */
export type BookKey = "istilah" | "bahasa";
export type SubNav = { back?: BookKey; map?: "2d" | "3d"; slotOnly?: true };

/**
 * What the top bar's second row shows for a page, read from its path alone
 * (so it renders on the server and stays put between the pages it serves).
 * The Ruang Studi has no tabs: Istilah Teknis and Bahasa are books in the
 * Perpustakaan, and their pages (Daftar, Domain, the full Peta Otak, the
 * Bahasa list) open from buttons inside the book. On those pages the row
 * starts with the way back to the book, then the Peta Otak's 2D/3D switch
 * where it applies. Switches that hold a page's own state come through the
 * page's slot (nav-slot.tsx); `slotOnly` keeps the row open for a page whose
 * row is all slot (a subject's tabs), so it does not appear late. Null: no
 * second row (the Perpustakaan itself, where the books hold their buttons).
 */
export function subNavFor(pathname: string): SubNav | null {
  if (/^\/subjects\/[^/]+$/.test(pathname)) return { slotOnly: true };
  if (isActivePath(pathname, "/studi/bahasa")) return { back: "bahasa" };
  if (!isActivePath(pathname, "/studi/istilah")) return null;
  if (isActivePath(pathname, "/studi/istilah/peta")) {
    return { back: "istilah", map: isActivePath(pathname, "/studi/istilah/peta/3d") ? "3d" : "2d" };
  }
  return { back: "istilah" };
}
