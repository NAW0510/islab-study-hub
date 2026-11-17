import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { Shape } from "@/components/shape";
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
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-12">
      {/* A quiet Bauhaus composition at the edges; decoration only. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden sm:block">
        <Shape kind="quarter" color="blue" className="bob absolute top-[12%] left-[9%] size-16 opacity-90" />
        <Shape kind="circle" color="yellow" className="bob bob-1 absolute top-[22%] right-[11%] size-12" />
        <Shape kind="triangle" color="red" className="bob bob-2 absolute bottom-[16%] left-[14%] size-12" />
        <Shape kind="square" color="green" className="bob bob-3 absolute right-[16%] bottom-[12%] size-10" />
        <Shape kind="plus" color="yellow" className="absolute bottom-[34%] left-[6%] size-6 opacity-80" />
        <Shape kind="spark" color="blue" className="absolute top-[10%] right-[30%] size-5 opacity-80" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandMark size="lg" className="mb-6" />
          <p className="eyebrow">
            <span className="eyebrow-rule" />
            ML &amp; Data Science
            <span className="eyebrow-rule" />
          </p>
          <h1 className="display mt-3 text-[clamp(2rem,1.5rem+2vw,2.75rem)] text-balance">{APP_NAME}</h1>
          <p className="mt-2 text-sm text-text-2">Catatan belajar, silabus, dan kosakata di satu tempat.</p>
        </div>

        <div className="rounded-panel border border-border bg-surface p-6 shadow-[var(--lift-shadow)] sm:p-7">
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
