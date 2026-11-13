import { Sidebar } from "@/components/sidebar";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { email } = await requireUser();

  return (
    <div className="min-h-dvh md:flex">
      <Sidebar email={email} />
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 md:px-10 md:py-10 print:max-w-none print:p-0">
          {children}
        </div>
      </main>
    </div>
  );
}
