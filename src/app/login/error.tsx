"use client";

import { useEffect } from "react";
import { unstable_isUnrecognizedActionError } from "next/navigation";

export default function LoginError({ error }: { error: Error & { digest?: string } }) {
  // The tab was loaded from an older build than the running server: a reload fixes it.
  const stale = unstable_isUnrecognizedActionError(error);

  useEffect(() => {
    if (stale) window.location.reload();
  }, [stale]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <p className="text-sm text-muted">
        {stale ? "Aplikasi baru saja diperbarui. Memuat ulang…" : "Login gagal dimuat."}
      </p>
      {!stale && (
        <button type="button" className="btn btn-secondary mt-4" onClick={() => window.location.reload()}>
          Muat ulang
        </button>
      )}
    </div>
  );
}
