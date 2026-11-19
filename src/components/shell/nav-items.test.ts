import { describe, expect, it } from "vitest";
import { isImmersive, sectionOf, subNavFor } from "./nav-items";

describe("subNavFor", () => {
  it("shows the Kosakata tabs on every Kosakata page", () => {
    expect(subNavFor("/vocab")).toEqual({ vocab: "list" });
    expect(subNavFor("/vocab/perpustakaan")).toEqual({ vocab: "library" });
    expect(subNavFor("/vocab/domains")).toEqual({ vocab: "domains" });
  });

  it("adds the 2D/3D switch on the Peta Otak", () => {
    expect(subNavFor("/vocab/map")).toEqual({ vocab: "map", map: "2d" });
    expect(subNavFor("/vocab/map/3d")).toEqual({ vocab: "map", map: "3d" });
  });

  it("keeps the row open on a subject's page, whose tabs come through the slot", () => {
    expect(subNavFor("/subjects/abc-123")).toEqual({ slotOnly: true });
    expect(subNavFor("/subjects")).toBeNull();
  });

  it("has nothing for other sections, or for paths that only start alike", () => {
    expect(subNavFor("/")).toBeNull();
    expect(subNavFor("/notes")).toBeNull();
    expect(subNavFor("/vocabulary")).toBeNull();
    expect(subNavFor("/vocab/mapping")).toEqual({ vocab: "list" });
  });
});

describe("isImmersive", () => {
  it("is true on the Perpustakaan and every Peta Otak view only", () => {
    expect(isImmersive("/vocab/perpustakaan")).toBe(true);
    expect(isImmersive("/vocab/map")).toBe(true);
    expect(isImmersive("/vocab/map/3d")).toBe(true);
    expect(isImmersive("/vocab")).toBe(false);
    expect(isImmersive("/vocab/mapping")).toBe(false);
  });
});

describe("sectionOf", () => {
  it("finds the section, Dashboard for anything unknown", () => {
    expect(sectionOf("/vocab/map/3d").href).toBe("/vocab");
    expect(sectionOf("/somewhere").href).toBe("/");
  });
});
