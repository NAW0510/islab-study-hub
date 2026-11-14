/** Main navigation, in order. The position (01, 02, …) is shown next to each label. */
export const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/subjects", label: "Subjek & Silabus" },
  { href: "/notes", label: "Catatan" },
  { href: "/resources", label: "Sumber Belajar" },
  { href: "/reports", label: "Laporan Mingguan" },
] as const;

export function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** "01", "02", … */
export function navNumber(index: number) {
  return String(index + 1).padStart(2, "0");
}
