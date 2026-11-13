import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "./env";

// /r/<token> = shared weekly reports, readable without an account.
const PUBLIC_PATHS = ["/login", "/auth", "/r"];

/**
 * Refreshes the Supabase session cookie on every request and gates the app
 * behind login. Pages and server actions still verify the user themselves;
 * this is the first line of defence, not the only one.
 */
export async function updateSession(request: NextRequest) {
  const { url, key } = getSupabaseEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // Do not run code between createServerClient and getClaims().
  const { data, error } = await supabase.auth.getClaims();
  const isLoggedIn = Boolean(data?.claims?.sub);

  const { pathname, search } = request.nextUrl;
  const authCookie = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name === authCookie || c.name.startsWith(`${authCookie}.`));
  if (!isLoggedIn && hasAuthCookie) {
    // A session cookie exists but could not be verified — log why, otherwise
    // the user just silently bounces back to /login.
    console.error(`[auth] ${pathname}: sesi ditolak — ${error?.message ?? "claims kosong"}`);
  }
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!isLoggedIn && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname + search);
    return redirectWithCookies(loginUrl, response);
  }

  if (isLoggedIn && pathname === "/login") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return redirectWithCookies(homeUrl, response);
  }

  return response;
}

function redirectWithCookies(url: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  // Keep the no-cache headers Supabase adds when it refreshes auth cookies.
  for (const name of ["cache-control", "expires", "pragma"]) {
    const value = from.headers.get(name);
    if (value) redirect.headers.set(name, value);
  }
  return redirect;
}
