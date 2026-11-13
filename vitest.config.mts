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
    include: ["src/**/*.test.ts"],
  },
});
