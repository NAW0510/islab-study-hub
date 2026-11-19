import { Box, Brain, Orbit, type LucideIcon } from "lucide-react";
import type { Layout3dData } from "@/lib/vocab/map3d-model";
import type { MapPoint } from "@/lib/vocab/map-model";
import { BrainScene } from "./brain";
import type { Theme, ViewScene } from "./common";
import { CubeScene } from "./cube";
import { SpaceScene } from "./space";

/**
 * Every look of the 3D brain map, in the order of the switch.
 *
 * To add a visualisation:
 *   1. write a class that implements ViewScene (common.ts; the three scenes
 *      next to this file are worked examples, from simple to moving);
 *   2. add an entry below.
 * The shell (brain-map-3d.tsx) builds the switch, canvas theme, toolbar
 * controls, motion, info panel and credits from this list; it needs no other
 * change. Data every scene gets: the 3D layout (cube positions, roles,
 * neighbours, brain slots), all and visible terms, domains, and token colours.
 */
export type ViewDefinition = {
  /** Stable id; the browser remembers the last one chosen. */
  key: string;
  label: string;
  Icon: LucideIcon;
  /** Canvas theme: fixed, or "choice" to show the Gelap/Terang switch. */
  theme: Theme | "choice";
  /** Shows the "Batas" choice (field / branch / none). */
  boundaries?: boolean;
  /**
   * Its terms move by themselves while "Putar otomatis" is on (scene time
   * runs), and the camera keeps a selected term in view.
   */
  moving?: boolean;
  /** Camera turn speed while "Putar otomatis" is on. */
  autoRotateSpeed: number;
  /** Canvas background: Tailwind classes using design tokens only. */
  background: string;
  /**
   * The view's intro (lib/vocab/map/intro.ts): how long the full one lasts,
   * whether it rises out of black, and how much farther the camera starts.
   */
  intro: { fullMs: number; veil: "black" | "none"; dolly: number };
  /** What the view shows and how to read it (info panel). */
  info: string;
  /** Credit for borrowed material, shown in the info panel. */
  credit?: { lead: string; title: string; titleUrl: string; author: string; authorUrl: string; license: string; licenseUrl: string; note: string };
  /** An extra line in the tooltip of a term, specific to this view. */
  describe?: (id: string, data: Layout3dData, terms: ReadonlyMap<string, MapPoint>) => string | null;
  create: () => ViewScene;
};

const SOFT_BACKGROUND = "bg-[radial-gradient(ellipse_at_center,var(--surface-2),var(--bg))]";

export const VIEWS_3D = [
  {
    key: "space",
    label: "Luar angkasa",
    Icon: Orbit,
    theme: "dark",
    moving: true,
    autoRotateSpeed: 0.25,
    background: "bg-[radial-gradient(ellipse_at_center,var(--surface),var(--bg)_70%)]",
    // Fade to black, then the galaxies grow slowly out of the dark.
    intro: { fullMs: 3600, veil: "black", dolly: 2.4 },
    info: "Tiap bidang adalah galaksi dengan lubang hitam di pusatnya, dan tiap cabang sebuah matahari. Planet adalah istilah inti di cabangnya; bulan mengorbit planet yang paling mirip maknanya; batuan adalah istilah yang hubungannya longgar atau belum punya domain. Nama lima bidang terbesar tampil samar; bidang lain muncul saat kamu menyorot atau memilih salah satu istilahnya. Saat “Putar otomatis” aktif, semuanya bergerak di orbitnya.",
    describe: (id, data, terms) => {
      const role = data.roles.get(id);
      if (!role) return null;
      if (role.kind === "planet") return "Planet: istilah inti di cabangnya";
      if (role.kind === "moon") return `Bulan dari ${terms.get(role.parent)?.term ?? "planet"}`;
      return "Batuan: hubungannya longgar";
    },
    create: () => new SpaceScene(),
  },
  {
    key: "brain",
    label: "Otak",
    Icon: Brain,
    theme: "light",
    autoRotateSpeed: 0.6,
    background: SOFT_BACKGROUND,
    // Spins from small to big and lands with a little overshoot.
    intro: { fullMs: 2600, veil: "none", dolly: 1.3 },
    info: "Tiap bidang menempati lobus otaknya sendiri (nama lima bidang terbesar tampil samar; bidang lain muncul saat kamu menyorot atau memilih salah satu istilahnya), dan tiap istilah menyalakan satu neuron di dekat istilah yang mirip maknanya. Garis tipis menghubungkan istilah dengan dua istilah termiripnya. Neuron abu-abu masih “tidur”: merekalah yang memberi bentuk otak sampai istilahmu sekitar 350, setelah itu istilahmu sendiri yang membentuknya. Mulai 1.500 istilah, neuron bertambah 500 setiap kali kapasitasnya terlewati.",
    credit: {
      lead: "Bentuk otak:",
      title: "“Brain”",
      titleUrl: "https://sketchfab.com/3d-models/brain-cadd2bde67404c43b2359a6a3281d84a",
      author: "dgallichan",
      authorUrl: "https://sketchfab.com/dgallichan",
      license: "CC BY 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      note: "disederhanakan menjadi titik-titik di permukaan luarnya.",
    },
    create: () => new BrainScene(),
  },
  {
    key: "cube",
    label: "Kubus",
    Icon: Box,
    theme: "choice",
    boundaries: true,
    autoRotateSpeed: 0.7,
    background: SOFT_BACKGROUND,
    // The frame grows, then the terms bloom out of the middle to their places.
    intro: { fullMs: 2400, veil: "none", dolly: 1.6 },
    info: "Titik yang berdekatan memang mirip maknanya. Jarak antarkelompok yang berjauhan tidak bisa dibaca secara presisi, karena UMAP menjaga struktur lokal, bukan jarak global.",
    create: () => new CubeScene(),
  },
] as const satisfies readonly ViewDefinition[];

export type View3d = (typeof VIEWS_3D)[number]["key"];

export const VIEW_KEYS: readonly View3d[] = VIEWS_3D.map((v) => v.key);

export function viewDefinition(key: View3d): ViewDefinition {
  return VIEWS_3D.find((v) => v.key === key) ?? VIEWS_3D[0];
}

/** What a first-time visitor sees: space on a dark system, the brain on a light one. */
export const defaultView = (prefersDark: boolean): View3d => (prefersDark ? "space" : "brain");
