import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Plain form POST (not a server action) so signing out works even from a tab
 * that is older than the running server, and the 303 redirect is a full page
 * load that wipes the client-side cache of pages seen while signed in.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
