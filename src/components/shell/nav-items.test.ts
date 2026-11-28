import { describe, expect, it } from "vitest";
import { isImmersive, sectionOf, subNavFor } from "./nav-items";

describe("subNavFor", () => {
  it("has no tabs in the Perpustakaan: the books hold their own buttons", () => {
    expect(subNavFor("/studi")).toBeNull();
  });

  it("starts a book's own pages with the way back to the book", () => {
    expect(subNavFor("/studi/istilah")).toEqual({ back: "istilah" });
    expect(subNavFor("/studi/istilah/domain")).toEqual({ back: "istilah" });
    expect(subNavFor("/studi/bahasa")).toEqual({ back: "bahasa" });
  });

  it("adds the 2D/3D switch on the full Peta Otak", () => {
    expect(subNavFor("/studi/istilah/peta")).toEqual({ back: "istilah", map: "2d" });
    expect(subNavFor("/studi/istilah/peta/3d")).toEqual({ back: "istilah", map: "3d" });
  });

  it("keeps the row open on a subject's page, whose tabs come through the slot", () => {
    expect(subNavFor("/subjects/abc-123")).toEqual({ slotOnly: true });
    expect(subNavFor("/subjects")).toBeNull();
  });

  it("has nothing for other sections, or for paths that only start alike", () => {
    expect(subNavFor("/")).toBeNull();
    expect(subNavFor("/notes")).toBeNull();
    expect(subNavFor("/studio")).toBeNull();
    expect(subNavFor("/studi/istilahku")).toBeNull();
    expect(subNavFor("/studi/istilah/petak")).toEqual({ back: "istilah" });
  });
});

describe("isImmersive", () => {
  it("is true on the Perpustakaan and every Peta Otak view only", () => {
    expect(isImmersive("/studi")).toBe(true);
    expect(isImmersive("/studi/istilah/peta")).toBe(true);
    expect(isImmersive("/studi/istilah/peta/3d")).toBe(true);
    expect(isImmersive("/studi/istilah")).toBe(false);
    expect(isImmersive("/studi/bahasa")).toBe(false);
    expect(isImmersive("/studi/istilah/petak")).toBe(false);
  });
});

describe("sectionOf", () => {
  it("finds the section, Dashboard for anything unknown", () => {
    expect(sectionOf("/studi/istilah/peta/3d").href).toBe("/studi");
    expect(sectionOf("/studi/bahasa").label).toBe("Ruang Studi");
    expect(sectionOf("/somewhere").href).toBe("/");
  });
});
