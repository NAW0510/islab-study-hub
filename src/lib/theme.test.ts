import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveScheme, storedFor, THEME_SCRIPT, THEME_STORAGE_KEY } from "./theme";

describe("storedFor", () => {
  it("forgets a choice that matches the device, so the app follows the device again", () => {
    expect(storedFor("dark", true)).toBeNull();
    expect(storedFor("light", false)).toBeNull();
  });

  it("remembers a choice that differs from the device", () => {
    expect(storedFor("dark", false)).toBe("dark");
    expect(storedFor("light", true)).toBe("light");
  });
});

describe("resolveScheme", () => {
  it("lets a remembered choice win", () => {
    expect(resolveScheme("light", true)).toBe("light");
    expect(resolveScheme("dark", false)).toBe("dark");
  });

  it("falls back to the device for nothing or junk", () => {
    expect(resolveScheme(null, true)).toBe("dark");
    expect(resolveScheme(undefined, false)).toBe("light");
    expect(resolveScheme("sepia", false)).toBe("light");
  });
});

describe("THEME_SCRIPT", () => {
  const run = (storage: { getItem: (key: string) => string | null }) => {
    const root = { dataset: {} as Record<string, string> };
    new Function("localStorage", "document", THEME_SCRIPT)(storage, { documentElement: root });
    return root.dataset.theme;
  };

  it("pins a remembered scheme on <html>", () => {
    expect(run({ getItem: (key) => (key === THEME_STORAGE_KEY ? "dark" : null) })).toBe("dark");
  });

  it("leaves <html> alone without a valid choice", () => {
    expect(run({ getItem: () => null })).toBeUndefined();
    expect(run({ getItem: () => "sepia" })).toBeUndefined();
  });

  it("survives blocked storage", () => {
    expect(
      run({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toBeUndefined();
  });
});

describe("print", () => {
  it("is light even when the theme button pinned dark", () => {
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    const print = /@media print\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(print).toMatch(/:root\[data-theme\][^{]*\{[^}]*color-scheme:\s*light !important/);
  });
});
