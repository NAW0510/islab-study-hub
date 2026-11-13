import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-medium text-accent">404</p>
      <h1 className="mt-2 text-2xl font-semibold">Halaman tidak ditemukan</h1>
      <p className="mt-2 text-sm text-muted">Mungkin datanya sudah dihapus atau link-nya salah.</p>
      <Link href="/" className="btn btn-primary mt-6">
        Kembali ke dashboard
      </Link>
    </div>
  );
}
