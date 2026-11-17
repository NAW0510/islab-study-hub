// Runs the app against the LOCAL Supabase stack (supabase start) on port 3100,
// so the real project and your real data are never touched:
//
//   npm run dev:local
//
// Creates/reuses a local-only dev account (sign-up is enabled on the local
// stack); its credentials are in scripts/local-stack.mjs.
import { spawn } from "node:child_process";
import { ensureDevAccount, localStack } from "./local-stack.mjs";

const { url, key } = localStack();
console.log(await ensureDevAccount({ url, key }));
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
