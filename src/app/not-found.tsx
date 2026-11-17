import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <p className="eyebrow">
        <span className="font-display text-xs tracking-[0.08em] text-text tabular-nums">404</span>
        <span className="eyebrow-rule" />
        Tidak ditemukan
      </p>
      <h1 className="display mt-3 text-[clamp(1.75rem,1.3rem+2vw,2.5rem)] text-balance">Halaman tidak ditemukan</h1>
      <p className="mt-2 text-sm text-muted">Mungkin datanya sudah dihapus atau link-nya salah.</p>
      <Link href="/" className="btn btn-primary mt-6">
        Kembali ke dashboard
      </Link>
    </div>
  );
}
