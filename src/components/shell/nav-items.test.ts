import { describe, expect, it } from "vitest";
import { isImmersive, sectionOf, subNavFor } from "./nav-items";

describe("subNavFor", () => {
  it("shows the Ruang Studi's parts on every page of it", () => {
    expect(subNavFor("/studi")).toEqual({ study: "library" });
    expect(subNavFor("/studi/bahasa")).toEqual({ study: "languages" });
  });

  it("adds Istilah Teknis' pages under Istilah Teknis", () => {
    expect(subNavFor("/studi/istilah")).toEqual({ study: "terms", terms: "list" });
    expect(subNavFor("/studi/istilah/domain")).toEqual({ study: "terms", terms: "domains" });
  });

  it("adds the 2D/3D switch on the Peta Otak", () => {
    expect(subNavFor("/studi/istilah/peta")).toEqual({ study: "terms", terms: "map", map: "2d" });
    expect(subNavFor("/studi/istilah/peta/3d")).toEqual({ study: "terms", terms: "map", map: "3d" });
  });

  it("keeps the row open on a subject's page, whose tabs come through the slot", () => {
    expect(subNavFor("/subjects/abc-123")).toEqual({ slotOnly: true });
    expect(subNavFor("/subjects")).toBeNull();
  });

  it("has nothing for other sections, or for paths that only start alike", () => {
    expect(subNavFor("/")).toBeNull();
    expect(subNavFor("/notes")).toBeNull();
    expect(subNavFor("/studio")).toBeNull();
    expect(subNavFor("/studi/istilahku")).toEqual({ study: "library" });
    expect(subNavFor("/studi/istilah/petak")).toEqual({ study: "terms", terms: "list" });
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
