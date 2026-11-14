import { MobileMenu } from "@/components/shell/mobile-menu";
import { Sidebar } from "@/components/shell/sidebar";
import { requireUser } from "@/lib/auth";
import { getProfile } from "@/lib/queries";
import { currentWeekInfo } from "@/lib/report-template";
import { todayISO } from "@/lib/utils";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, email } = await requireUser();
  const profile = await getProfile(supabase);
  // "Today" is computed in the app timezone, not the server's (see TIMEZONE).
  const { marker, periodLabel } = currentWeekInfo(profile?.program_start, todayISO());
  const shell = { email, weekMarker: marker, weekPeriod: periodLabel };

  return (
    <div className="min-h-dvh md:flex">
      <Sidebar {...shell} />
      <MobileMenu {...shell} />
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 md:px-10 md:py-10 print:max-w-none print:p-0">
          {children}
        </div>
      </main>
    </div>
  );
}
