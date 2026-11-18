"use client";

import { useEffect, type FormEvent, type ReactNode } from "react";
import { Info, Search, X } from "lucide-react";
import type { BoundaryLevel, MapStats } from "@/lib/vocab/map-model";
import { cn } from "@/lib/utils";

/*
 * The Peta Otak's controls, shared by the 2D and 3D views and laid out for
 * the full-screen stage: the tools sit at the far end of the top bar's
 * second row (through NavSlot place="end"), the legend is a light list over
 * the canvas, the stats one line in the Week bar, and "how to read this" a
 * panel just under the bar. Nothing else stands between the map and the
 * screen.
 */

/** Search, compact in the bar and wider while in use. Enter flies to the term. */
export function MapSearch({
  value,
  onChange,
  onSubmit,
  label,
  listId,
  terms,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  label: string;
  listId: string;
  terms: readonly { id: string; term: string }[];
}) {
  return (
    <form onSubmit={onSubmit} role="search" className="navbar-search">
      <Search aria-hidden="true" className="navbar-search-icon size-3.5" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Cari istilah…"
        aria-label={label}
        list={listId}
        className="navbar-field navbar-search-input"
      />
      <datalist id={listId}>
        {terms.slice(0, 500).map((t) => (
          <option key={t.id} value={t.term} />
        ))}
      </datalist>
    </form>
  );
}

/** Region boundaries: per field, per branch, or none. */
export function MapBoundary({ value, onChange }: { value: BoundaryLevel; onChange: (level: BoundaryLevel) => void }) {
  return (
    <label className="navbar-label">
      <span className="hidden xl:inline">Batas</span>
      <select value={value} onChange={(e) => onChange(e.target.value as BoundaryLevel)} className="navbar-field" aria-label="Tingkat batas wilayah">
        <option value="bidang">Bidang</option>
        <option value="cabang">Cabang</option>
        <option value="none">Tanpa batas</option>
      </select>
    </label>
  );
}

/** A tool that stays on or off (Putar otomatis): a raised pill while on. Its words show on the widest screens; an icon otherwise. */
export function MapToggle({ pressed, onClick, icon, label }: { pressed: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button type="button" className="navbar-toggle" aria-pressed={pressed} onClick={onClick} title={label}>
      {icon}
      <ResponsiveLabel text={label} from="2xl" />
    </button>
  );
}

/** Words shown from a breakpoint up, and kept for screen readers below it (the button shows its icon there). */
export function ResponsiveLabel({ text, from }: { text: string; from: "xl" | "2xl" }) {
  return <span className={from === "xl" ? "sr-only xl:not-sr-only" : "sr-only 2xl:not-sr-only"}>{text}</span>;
}

export function MapInfoButton({ open, onToggle, label }: { open: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" className="navbar-icon" aria-label={label} aria-expanded={open} onClick={onToggle}>
      <Info className="size-4" />
    </button>
  );
}

/** "How to read this": a panel just under the top bar, on the right. Esc or × closes it. */
export function MapInfoPanel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <section className="map-info card" aria-label={title}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-sm font-semibold tracking-tight">{title}</h2>
        <button type="button" className="icon-btn -mt-1.5 -mr-2 size-8" aria-label="Tutup" onClick={onClose}>
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-1.5 space-y-2 text-sm text-text-2">{children}</div>
    </section>
  );
}

export type LegendItem = { id: string; name: string; color: string; count: number };

/** The fields, as a light list over the canvas (no card): a click hides or shows one, hovering lights it. */
export function MapLegend({
  items,
  hidden,
  onToggle,
  onHover,
}: {
  items: readonly LegendItem[];
  hidden: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="map-legend" aria-label="Legenda bidang">
      {items.map((f) => {
        const off = hidden.has(f.id);
        return (
          <li key={f.id} className="shrink-0">
            <button
              type="button"
              aria-pressed={!off}
              onClick={() => onToggle(f.id)}
              onPointerEnter={() => onHover(f.id)}
              onPointerLeave={() => onHover(null)}
              className={cn("map-legend-item", off && "opacity-40")}
            >
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: f.color }} />
              <span className="flex-1 truncate">{f.name}</span>
              <span className="text-xs text-muted tabular-nums">{f.count}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The map's numbers as one line in the Week bar (wide screens). */
export function MapStatsLine({ stats }: { stats: MapStats }) {
  const items: [string, ReactNode][] = [
    ["Istilah tampil", <><b>{stats.total}</b> istilah</>],
    ["Cabang ilmu aktif", <><b>{stats.activeDomains}</b> cabang</>],
    ["Baru minggu ini", <><b>{stats.thisWeek}</b> baru minggu ini</>],
  ];
  if (stats.biggestField) items.push(["Bidang terbesar", <>terbesar <b>{stats.biggestField.name}</b> ({stats.biggestField.count})</>]);
  return (
    <dl className="map-stats map-stats-line">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="sr-only">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
