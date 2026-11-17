import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight, NotebookPen, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { RollText } from "@/components/roll-text";
import { NAV_ITEMS, navNumber } from "@/components/shell/nav-items";
import { TermMarquee, TermMarqueePause } from "@/components/vocab/term-marquee";
import { requireUser } from "@/lib/auth";
import { CHIP_TONE_WEIGHT, contrast, DOMAIN_TOKENS, mix, parseTokens, type Scheme, type TokenMap } from "@/lib/design/contrast";
import { getProfile } from "@/lib/queries";
import { currentWeekInfo } from "@/lib/report-template";
import { cn, todayISO } from "@/lib/utils";

export const metadata: Metadata = { title: "Design system" };

const TOKEN_SELECTOR = ":root, .theme-scope";

const CORE: { name: string; label: string; role: string }[] = [
  { name: "--bg", label: "Kertas", role: "Latar halaman" },
  { name: "--surface", label: "Permukaan", role: "Kartu, panel" },
  { name: "--surface-2", label: "Permukaan 2", role: "Hover, isian halus" },
  { name: "--border", label: "Garis", role: "Garis rambut" },
  { name: "--border-strong", label: "Garis tegas", role: "Tepi input, tombol" },
  { name: "--text", label: "Tinta", role: "Teks utama" },
  { name: "--muted", label: "Tinta redup", role: "Teks sekunder" },
  { name: "--primary", label: "Aksi utama", role: "Tombol utama" },
  { name: "--accent", label: "Aksen", role: "Tautan, fokus, progres" },
  { name: "--accent-soft", label: "Aksen lembut", role: "Sorotan" },
];

const CONTRAST_PAIRS: [string, string, string][] = [
  ["--text", "--bg", "Teks di kertas"],
  ["--muted", "--bg", "Teks redup di kertas"],
  ["--muted", "--surface", "Teks redup di kartu"],
  ["--accent", "--surface", "Tautan di kartu"],
  ["--primary-fg", "--primary", "Teks tombol utama"],
  ["--danger", "--surface", "Teks bahaya di kartu"],
];

const DOMAIN_NAMES = ["Biru", "Jingga", "Toska", "Kuning", "Merah muda", "Hijau", "Ungu", "Merah", "Sian", "Cokelat"];

const STATUSES = [
  { tone: "tone-none", label: "Belum mulai" },
  { tone: "tone-warn", label: "Sedang dipelajari" },
  { tone: "tone-good", label: "Selesai" },
  { tone: "tone-bad", label: "Terlambat" },
];

const RADII = [
  { token: "--r-control", label: "Kontrol", value: "8 px", className: "rounded-control" },
  { token: "--r-card", label: "Kartu", value: "14 px", className: "rounded-card" },
  { token: "--r-panel", label: "Panel", value: "24 px", className: "rounded-panel" },
  { token: "--r-btn", label: "Tombol, chip", value: "pil", className: "rounded-btn" },
];

/** Dev-only style guide for the design tokens in globals.css. Not available in production. */
export default async function DesignPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const { supabase, email } = await requireUser();
  const profile = await getProfile(supabase);
  const { marker, periodLabel } = currentWeekInfo(profile?.program_start, todayISO());
  const tokens = parseTokens(readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8"), TOKEN_SELECTOR);

  const sample: Sample = {
    tokens,
    weekMarker: marker,
    period: periodLabel,
    name: profile?.full_name?.split(" ")[0] || email.split("@")[0],
  };

  return (
    <div className="mx-auto max-w-[110rem] px-4 py-8 sm:px-8">
      <header className="mb-8 max-w-3xl">
        <p className="eyebrow">Hanya di mode dev</p>
        <h1 className="display mt-3 text-[clamp(1.75rem,1.2rem+2.4vw,2.75rem)]">Design system</h1>
        <p className="mt-3 text-sm text-muted">
          Token dan komponen dasar aplikasi, di mode terang dan gelap. Nilai warna dan kontras dibaca langsung dari{" "}
          <code>globals.css</code>. Penjelasannya ada di <code>docs/DESIGN_SYSTEM.md</code>.
        </p>
      </header>

      <div className="grid gap-6 2xl:grid-cols-2">
        <Specimen scheme="light" sample={sample} />
        <Specimen scheme="dark" sample={sample} />
      </div>
    </div>
  );
}

type Sample = { tokens: TokenMap; weekMarker: string; period: string; name: string };

function Specimen({ scheme, sample }: { scheme: Scheme; sample: Sample }) {
  const { tokens } = sample;
  const hex = (name: string) => tokens[name]?.[scheme] ?? "";

  return (
    <section
      aria-label={scheme === "light" ? "Mode terang" : "Mode gelap"}
      className={cn(
        "theme-scope rounded-panel border border-border bg-bg p-5 text-text sm:p-8",
        scheme === "light" ? "scheme-light" : "scheme-dark",
      )}
    >
      <p className="eyebrow mb-8">
        <span className="size-1.5 rounded-full bg-accent" />
        {scheme === "light" ? "Mode terang" : "Mode gelap"}
      </p>

      {/* Penanda Week + judul halaman */}
      <Block title="Penanda Week dan judul">
        <p className="eyebrow">
          <span className="font-display text-xs tracking-[0.08em] text-text tabular-nums">{sample.weekMarker}</span>
          <span className="eyebrow-rule" />
          {sample.period}
        </p>
        <h2 className="display mt-3 text-[clamp(1.75rem,1.2rem+2.4vw,2.75rem)]">Selamat malam, {sample.name}</h2>
        <p className="mt-3 max-w-xl text-sm text-muted">
          Penanda Week dihitung dari tanggal mulai di profil laporan, sama seperti Laporan Mingguan. Ini satu-satunya
          nomor di dashboard.
        </p>
      </Block>

      <Block title="Warna inti">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {CORE.map((c) => (
            <li key={c.name}>
              <div className="h-14 rounded-control border border-border" style={{ backgroundColor: `var(${c.name})` }} />
              <p className="mt-2 text-xs font-medium">{c.label}</p>
              <p className="font-mono text-[11px] text-muted">{hex(c.name)}</p>
              <p className="text-[11px] text-muted">{c.role}</p>
            </li>
          ))}
        </ul>
        <table className="mt-6 w-full text-left text-xs">
          <caption className="mb-2 text-left text-muted">Kontras teks (WCAG AA butuh 4,5 : 1)</caption>
          <tbody>
            {CONTRAST_PAIRS.map(([fg, bg, label]) => (
              <tr key={label} className="border-t border-border">
                <td className="py-1.5 pr-3">{label}</td>
                <td className="py-1.5 text-right tabular-nums">{contrast(hex(fg), hex(bg)).toFixed(1)} : 1</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Block>

      <Block title="Status" note="Warna sinyal hanya untuk status, selalu bersama labelnya.">
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <span key={s.label} className={cn("chip chip-tone", s.tone)}>
              {s.label}
            </span>
          ))}
        </div>
        <p className="mt-3 text-sm">
          <span className="font-medium text-danger">Terlambat 3 hari</span>
          <span className="text-muted"> · </span>
          <span className="font-medium text-success">Selesai 12 dari 40 topik</span>
        </p>
      </Block>

      <Block
        title="Palet kategorikal"
        note="Untuk subjek sekarang dan domain Kosakata nanti. Urutannya sudah divalidasi agar warna bersebelahan tetap terbedakan bagi penyandang buta warna. Teks di atasnya selalu tinta."
      >
        <ul className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
          {DOMAIN_TOKENS.map((token, i) => (
            <li key={token} className={cn("flex items-center gap-2.5", `tone-domain-${i + 1}`)}>
              <span className="w-4 text-right text-[11px] text-muted tabular-nums">{i + 1}</span>
              <span className={cn("chip chip-tone", `tone-domain-${i + 1}`)}>{DOMAIN_NAMES[i]}</span>
              <span className="h-1.5 min-w-6 flex-1 rounded-full" style={{ backgroundColor: "var(--tone)" }} />
            </li>
          ))}
          <li className="tone-none flex items-center gap-2.5">
            <span className="w-4 text-right text-[11px] text-muted">–</span>
            <span className="chip chip-tone tone-none">Tanpa domain</span>
            <span className="h-1.5 min-w-6 flex-1 rounded-full" style={{ backgroundColor: "var(--tone)" }} />
          </li>
        </ul>
        <p className="mt-3 text-[11px] text-muted">
          Kontras tinta di chip paling rendah:{" "}
          <span className="tabular-nums">
            {Math.min(
              ...DOMAIN_TOKENS.map((t) => contrast(hex("--text"), mix(hex(t), hex("--surface"), CHIP_TONE_WEIGHT))),
            ).toFixed(1)}{" "}
            : 1
          </span>
        </p>
      </Block>

      <Block title="Tipografi" note="Plus Jakarta Sans untuk judul, angka besar, dan nav. Geist untuk isi. Geist Mono untuk kode.">
        <div className="space-y-3">
          <p className="display text-[2.75rem]">Peta Otak 44</p>
          <p className="display text-[2rem]">Subjek &amp; Silabus 32</p>
          <p className="display text-2xl">Catatan terbaru 24</p>
          <p className="text-base">Isi 16: gradien adalah vektor turunan parsial sebuah fungsi.</p>
          <p className="text-sm">Isi 14 (ukuran utama UI): model terlalu menghafal data latih.</p>
          <p className="text-[13px] text-muted">Keterangan 13: diperbarui 14 Nov 2026.</p>
          <p className="eyebrow">Label kecil 11</p>
          <p className="font-mono text-[13px]">loss.backward()  # Geist Mono 13</p>
        </div>
      </Block>

      <Block title="Tombol" note="Arahkan kursor ke tombol utama: teksnya bergulir. Diam bila perangkat meminta gerak dikurangi.">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-primary">
            <Plus className="size-4" />
            <RollText>Simpan catatan</RollText>
          </button>
          <button type="button" className="btn btn-secondary">
            <Pencil className="size-4" /> Edit
          </button>
          <button type="button" className="btn btn-ghost">
            Batal
          </button>
          <button type="button" className="btn btn-danger">
            <Trash2 className="size-4" /> Hapus
          </button>
          <button type="button" className="btn btn-primary" disabled>
            Menyimpan…
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-primary btn-sm">
            <RollText>Tinjau</RollText>
          </button>
          <button type="button" className="btn btn-secondary btn-sm">
            Salin link
          </button>
          <button type="button" className="icon-btn" aria-label="Cari">
            <Search className="size-4" />
          </button>
          <a href="#" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:text-accent-hover">
            Semua catatan <ArrowRight className="size-3.5" />
          </a>
        </div>
      </Block>

      <Block title="Formulir">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor={`${scheme}-title`}>
              Judul
            </label>
            <input id={`${scheme}-title`} className="input" defaultValue="Regularisasi L2" />
            <p className="hint">Maksimal 300 karakter.</p>
          </div>
          <div>
            <label className="label" htmlFor={`${scheme}-subject`}>
              Subjek
            </label>
            <select id={`${scheme}-subject`} className="input" defaultValue="ml">
              <option value="ml">Machine Learning</option>
              <option value="stat">Statistika</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor={`${scheme}-body`}>
              Isi
            </label>
            <textarea id={`${scheme}-body`} className="input" rows={2} placeholder="Tulis dengan Markdown dan LaTeX…" />
          </div>
        </div>
      </Block>

      <Block title="Kartu">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="card p-4">
            <p className="eyebrow">Topik selesai</p>
            <p className="display mt-3 text-4xl tabular-nums">12/40</p>
            <p className="mt-1 text-xs text-muted">30% dari silabus</p>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full w-[30%] rounded-full bg-accent" />
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-2 text-xs text-muted">
              <NotebookPen className="size-3.5" /> 12 Nov 2026
            </div>
            <h3 className="mt-2 font-display text-base font-semibold tracking-tight">Backpropagation</h3>
            <p className="mt-1 text-sm text-muted">Menghitung gradien loss terhadap bobot lewat aturan rantai…</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="chip chip-tone tone-domain-1">Deep Learning</span>
              <span className="chip bg-surface-2 text-muted">#gradien</span>
            </div>
          </div>
        </div>
      </Block>

      <Block title="Radius" note="Radius mengikuti hierarki: makin besar wadahnya, makin besar sudutnya.">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {RADII.map((r) => (
            <li key={r.token}>
              <div className={cn("h-14 border border-border-strong bg-surface", r.className)} />
              <p className="mt-2 text-xs font-medium">{r.label}</p>
              <p className="text-[11px] text-muted">{r.value}</p>
            </li>
          ))}
        </ul>
      </Block>

      <Block title="Navigasi" note="Nomor hanya dipakai di sini dan di penanda Week.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-card border border-border bg-surface p-3">
            <p className="eyebrow px-3 pb-2">Sidebar desktop</p>
            <nav aria-label={`Contoh sidebar, ${scheme}`} className="flex flex-col gap-0.5">
              {NAV_ITEMS.map(({ label }, i) => (
                <a
                  key={label}
                  href="#"
                  aria-current={i === 0 ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-control px-3 py-2 text-sm font-medium transition-colors",
                    i === 0 ? "bg-surface-2 text-text" : "text-muted hover:bg-surface-2 hover:text-text",
                  )}
                >
                  <span className="w-5 font-display text-[11px] text-muted tabular-nums">{navNumber(i)}</span>
                  <RollText>{label}</RollText>
                  {i === 0 && <span className="ml-auto size-1.5 rounded-full bg-accent" />}
                </a>
              ))}
            </nav>
            <div className="mt-3 flex items-center justify-between border-t border-border px-3 pt-3 text-xs text-muted">
              <span className="chip border border-border bg-surface text-text">
                <span className="size-1.5 rounded-full bg-accent" />
                <span className="tabular-nums">{sample.weekMarker}</span>
              </span>
              <span className="tabular-nums">23.41 WIB</span>
            </div>
          </div>

          <div className="rounded-card border border-border bg-surface p-4">
            <p className="eyebrow pb-1">Menu layar penuh (mobile)</p>
            <nav aria-label={`Contoh menu mobile, ${scheme}`}>
              {NAV_ITEMS.slice(0, 4).map(({ label }, i) => (
                <a key={label} href="#" className="flex items-baseline gap-4 border-b border-border py-3.5">
                  <span className="font-display text-[11px] text-muted tabular-nums">{navNumber(i)}</span>
                  <span className={cn("display text-2xl", i === 0 ? "text-text" : "text-muted")}>{label}</span>
                </a>
              ))}
            </nav>
          </div>
        </div>
      </Block>

      <Block
        title="Pola Kosakata"
        note="Kontrol segmen, kartu bolak-balik (depan dan belakang), dan strip istilah terbaru. Strip berhenti saat disorot, difokus, atau dijeda."
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="segmented" role="group" aria-label={`Contoh segmen, ${scheme}`}>
              <button type="button" className="segmented-item" aria-pressed="true">
                Daftar
              </button>
              <button type="button" className="segmented-item" aria-pressed="false">
                Kartu
              </button>
            </div>
            <div className="segmented segmented-sm" role="group" aria-label={`Contoh segmen kecil, ${scheme}`}>
              <button type="button" className="segmented-item" aria-pressed="true">
                Tulis
              </button>
              <button type="button" className="segmented-item" aria-pressed="false">
                Pratinjau
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="card flex h-44 flex-col p-4">
              <span className="eyebrow">W7</span>
              <span className="mt-auto font-display text-2xl font-semibold tracking-tight">tensor</span>
              <span className="mt-3 flex">
                <span className="chip chip-tone tone-domain-1">Deep Learning › Machine Learning</span>
              </span>
            </div>
            <div className="card flex h-44 flex-col p-4">
              <span className="eyebrow">Definisi</span>
              <span className="mt-3 line-clamp-4 text-sm leading-6">
                Struktur data multidimensi: skalar, vektor, dan matriks adalah tensor berorde 0, 1, dan 2.
              </span>
            </div>
          </div>

          <div className="marquee-host">
            <div className="mb-2 flex items-center justify-between">
              <span className="eyebrow">Istilah terbaru</span>
              <TermMarqueePause />
            </div>
            <TermMarquee
              terms={["tensor", "backpropagation", "overfitting", "regularisasi", "softmax", "bootstrap"].map((term) => ({
                id: `contoh-${term}`,
                term,
              }))}
            />
          </div>
        </div>
      </Block>

      <Block title="Gerak" last>
        <ul className="grid gap-2 text-sm sm:grid-cols-3">
          <li className="card px-3 py-2">
            <span className="font-medium tabular-nums">120 ms</span>
            <span className="block text-xs text-muted">Hover, warna</span>
          </li>
          <li className="card px-3 py-2">
            <span className="font-medium tabular-nums">220 ms</span>
            <span className="block text-xs text-muted">Teks bergulir, chip</span>
          </li>
          <li className="card px-3 py-2">
            <span className="font-medium tabular-nums">420 ms</span>
            <span className="block text-xs text-muted">Menu layar penuh</span>
          </li>
        </ul>
        <p className="mt-3 text-xs text-muted">
          Satu kurva ease-out untuk semuanya. Hanya <code>transform</code> dan <code>opacity</code> yang dianimasikan.
        </p>
      </Block>
    </section>
  );
}

function Block({
  title,
  note,
  last = false,
  children,
}: {
  title: string;
  note?: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(!last && "mb-8 border-b border-border pb-8")}>
      <h3 className="eyebrow mb-1 text-text">{title}</h3>
      {note ? <p className="mb-4 max-w-xl text-xs text-muted">{note}</p> : <div className="mb-4" />}
      {children}
    </div>
  );
}
