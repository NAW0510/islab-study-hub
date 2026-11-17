import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { BrandMark } from "@/components/shell/brand-mark";
import { APP_NAME } from "@/lib/constants";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandMark size="lg" className="mb-5" />
          <p className="eyebrow">
            <span className="eyebrow-rule" />
            ML &amp; Data Science
            <span className="eyebrow-rule" />
          </p>
          <h1 className="display mt-3 text-[clamp(1.75rem,1.4rem+1.6vw,2.25rem)] text-balance">{APP_NAME}</h1>
          <p className="mt-2 text-sm text-muted">Catatan belajar, silabus, dan kosakata di satu tempat.</p>
        </div>

        <div className="rounded-panel border border-border bg-surface p-6 sm:p-7">
          <LoginForm next={typeof next === "string" ? next : "/"} />
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted">
          <Lock className="size-3.5" />
          Akses pribadi · pendaftaran publik ditutup
        </p>
      </div>
    </div>
  );
}
