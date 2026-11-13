"use client";

import { AlertTriangle } from "lucide-react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card mx-auto mt-10 max-w-lg p-6 text-center">
      <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-danger-soft text-danger">
        <AlertTriangle className="size-5" />
      </div>
      <h2 className="font-semibold">Terjadi kesalahan</h2>
      <p className="mt-2 text-sm break-words text-muted">
        {error.message || "Halaman gagal dimuat. Coba lagi sebentar."}
      </p>
      <button type="button" className="btn btn-secondary mt-5" onClick={reset}>
        Coba lagi
      </button>
    </div>
  );
}
