import { describe, expect, it } from "vitest";
import { TIMEZONE, todayISO } from "./utils";

describe("todayISO", () => {
  it("uses the app timezone (Asia/Jakarta by default), not the machine's", () => {
    expect(TIMEZONE).toBe("Asia/Jakarta");

    // 23:30 WIB on 13 Nov. Already 14 Nov in UTC+8/UTC+9, so a machine in
    // WITA or JST would answer 14 if its own zone leaked in.
    expect(todayISO(new Date("2026-11-13T16:30:00Z"))).toBe("2026-11-13");

    // 00:30 WIB on 14 Nov. Still 13 Nov in UTC, so a UTC server (Vercel)
    // would answer 13 if its own zone leaked in.
    expect(todayISO(new Date("2026-11-13T17:30:00Z"))).toBe("2026-11-14");
  });

  it("returns a plain YYYY-MM-DD string", () => {
    expect(todayISO(new Date("2026-01-05T03:00:00Z"))).toBe("2026-01-05");
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
