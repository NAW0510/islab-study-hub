import { headers } from "next/headers";

/** Public origin of the current request (the Vercel domain in production). */
export async function getOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto")?.split(",")[0] ?? "http";
  return `${proto}://${host}`;
}
