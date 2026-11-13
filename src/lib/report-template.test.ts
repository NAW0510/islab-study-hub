import { describe, expect, it } from "vitest";
import { addDays, DEFAULT_PROGRAM_START, weekLabel, weekNumberFor, weekPeriod } from "./report-template";

const START = DEFAULT_PROGRAM_START; // Monday 2026-09-28, first day of Week 1

describe("DEFAULT_PROGRAM_START", () => {
  it("is a Monday, so programme weeks run Monday–Sunday", () => {
    expect(new Date(`${START}T00:00:00Z`).getUTCDay()).toBe(1);
  });
});

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-09-28", 6)).toBe("2026-10-04");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-10-01", -3)).toBe("2026-09-28");
  });
});

describe("weekNumberFor", () => {
  it("counts anything before the programme as Week 0 (Onboarding)", () => {
    expect(weekNumberFor(START, "2026-09-27")).toBe(0);
    expect(weekNumberFor(START, "2026-08-01")).toBe(0);
  });

  it("starts Week 1 on the programme start date and lasts seven days", () => {
    expect(weekNumberFor(START, "2026-09-28")).toBe(1);
    expect(weekNumberFor(START, "2026-10-04")).toBe(1);
    expect(weekNumberFor(START, "2026-10-05")).toBe(2);
  });

  it("matches the calendar later in the programme", () => {
    expect(weekNumberFor(START, "2026-11-09")).toBe(7);
    expect(weekNumberFor(START, "2026-11-14")).toBe(7);
    expect(weekNumberFor(START, "2026-11-16")).toBe(8);
  });
});

describe("weekPeriod", () => {
  it("returns the Monday–Sunday period of a programme week", () => {
    expect(weekPeriod(START, 1)).toEqual({ start: "2026-09-28", end: "2026-10-04" });
    expect(weekPeriod(START, 7)).toEqual({ start: "2026-11-09", end: "2026-11-15" });
  });

  it("is consistent with weekNumberFor", () => {
    for (let week = 1; week <= 12; week++) {
      const { start, end } = weekPeriod(START, week);
      expect(weekNumberFor(START, start)).toBe(week);
      expect(weekNumberFor(START, end)).toBe(week);
    }
  });
});

describe("weekLabel", () => {
  it("names Week 0 Onboarding", () => {
    expect(weekLabel(0)).toBe("Onboarding");
    expect(weekLabel(7)).toBe("Week 7");
  });
});
