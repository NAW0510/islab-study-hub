"use client";

import { unstable_isUnrecognizedActionError } from "next/navigation";
import type { ActionResult } from "./types";

/**
 * Calls a server action from the browser and turns the two "infrastructure"
 * failures into something recoverable instead of a blank error page:
 *
 * - The tab was loaded from an older build than the server that is running now
 *   (dev server restarted, new Vercel deploy): the page reloads itself.
 * - The request never reached the server: a readable error is returned.
 *
 * Redirects and genuine bugs are re-thrown so Next.js and the error boundary
 * handle them as usual.
 */
export async function callAction<T = ActionResult>(run: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await run();
  } catch (error) {
    if (unstable_isUnrecognizedActionError(error)) {
      window.location.reload();
      return { error: "Aplikasi baru saja diperbarui. Memuat ulang halaman…" };
    }
    if (error instanceof TypeError && /fetch|network/i.test(error.message)) {
      return { error: "Tidak bisa terhubung ke server. Periksa koneksi lalu coba lagi." };
    }
    throw error;
  }
}
