import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

/**
 * Returns an authenticated Supabase client and the current user, or redirects
 * to /login. Call this at the top of every page and server action.
 */
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) {
    if (error) console.error(`[auth] requireUser: sesi ditolak — ${error.message}`);
    redirect("/login");
  }

  return {
    supabase,
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : "",
  };
});
