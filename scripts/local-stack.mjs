// Shared by the local-only scripts (dev-local, seed-local-vocab): where the
// LOCAL Supabase stack is and how to sign in to its throwaway dev account.
// Nothing here can reach the real project.
import { execSync } from "node:child_process";

// These credentials exist only in the throwaway local database:
export const DEV_EMAIL = "dev@study-hub.test";
export const DEV_PASSWORD = "dev-lokal-panjang-123";

/** URL and publishable key of the stack started with `npx supabase start`. */
export function localStack() {
  let status = {};
  try {
    const raw = execSync("npx supabase status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    status = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
  } catch {
    // handled below
  }
  const url = status.API_URL;
  const key = status.PUBLISHABLE_KEY || status.ANON_KEY;
  if (!url || !key) {
    console.error("Stack lokal belum berjalan. Jalankan dulu: npx supabase start");
    process.exit(1);
  }
  if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname)) {
    console.error(`Bukan stack lokal (${url}). Skrip ini hanya untuk localhost.`);
    process.exit(1);
  }
  return { url, key };
}

/** Creates the dev account if needed (sign-up is enabled locally). Returns a message for the console. */
export async function ensureDevAccount({ url, key }) {
  const signup = await fetch(`${url}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: key, "content-type": "application/json" },
    body: JSON.stringify({ email: DEV_EMAIL, password: DEV_PASSWORD }),
  });
  return signup.ok
    ? `Akun dev lokal siap: ${DEV_EMAIL} (password di scripts/local-stack.mjs)`
    : `Akun dev: ${(await signup.json()).msg ?? signup.status} (sudah ada? lanjut saja)`;
}

/** Signs in as the dev account (creating it first if the local database is fresh) and returns its access token. */
export async function signInDev({ url, key }) {
  const signIn = async () => {
    const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: key, "content-type": "application/json" },
      body: JSON.stringify({ email: DEV_EMAIL, password: DEV_PASSWORD }),
    });
    const body = await res.json();
    return { token: res.ok ? body.access_token : null, reason: body.msg ?? body.error_description ?? res.status };
  };
  let attempt = await signIn();
  if (!attempt.token) {
    await ensureDevAccount({ url, key });
    attempt = await signIn();
  }
  if (!attempt.token) throw new Error(`Login akun dev gagal: ${attempt.reason}`);
  return attempt.token;
}
