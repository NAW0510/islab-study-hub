// Runs the app against the LOCAL Supabase stack (supabase start) on port 3100,
// so the real project and your real data are never touched:
//
//   npm run dev:local
//
// Creates/reuses a local-only dev account (sign-up is enabled on the local
// stack). These credentials exist only in the throwaway local database:
export const DEV_EMAIL = "dev@study-hub.test";
export const DEV_PASSWORD = "dev-lokal-panjang-123";

import { execSync, spawn } from "node:child_process";

const raw = execSync("npx supabase status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const status = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
const url = status.API_URL;
const key = status.PUBLISHABLE_KEY || status.ANON_KEY;
if (!url || !key) {
  console.error("Stack lokal belum berjalan. Jalankan dulu: npx supabase start");
  process.exit(1);
}

const signup = await fetch(`${url}/auth/v1/signup`, {
  method: "POST",
  headers: { apikey: key, "content-type": "application/json" },
  body: JSON.stringify({ email: DEV_EMAIL, password: DEV_PASSWORD }),
});
console.log(
  signup.ok
    ? `Akun dev lokal siap: ${DEV_EMAIL} (password di scripts/dev-local.mjs)`
    : `Akun dev: ${(await signup.json()).msg ?? signup.status} (sudah ada? lanjut saja)`,
);
console.log(`Supabase lokal: ${url}`);

spawn("npx", ["next", "dev", "-p", "3100"], {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
  },
});
