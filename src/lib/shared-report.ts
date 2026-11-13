import { cache } from "react";
import { createClient } from "./supabase/server";
import type { ReportProfile, WeeklyReport } from "./types";

/**
 * Loads a report through its public share token. Works without a session:
 * the database function only returns the one report whose token matches.
 */
export const getSharedReport = cache(async (token: string) => {
  if (!/^[\w-]{20,64}$/.test(token)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_shared_report", { p_token: token });
  if (error || !data) return null;
  return data as { report: WeeklyReport; profile: ReportProfile | null };
});
