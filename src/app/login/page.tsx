import type { Metadata } from "next";
import { GraduationCap, Lock } from "lucide-react";
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
          <span className="mb-4 flex size-12 items-center justify-center rounded-xl bg-accent text-accent-fg shadow-sm">
            <GraduationCap className="size-6" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight">{APP_NAME}</h1>
          <p className="mt-1 text-sm text-muted">Catatan belajar ML & Data Science</p>
        </div>

        <div className="card p-6 shadow-sm">
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
