import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for pure functions (no DOM yet). Add jsdom + @vitejs/plugin-react
// only when component tests are needed.
export default defineConfig({
  resolve: {
    // Same alias as `paths` in tsconfig.json.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    // The Edge Function's pure logic lives in supabase/functions/_shared and is tested here too.
    include: ["src/**/*.test.ts", "supabase/functions/_shared/**/*.test.ts"],
  },
});
