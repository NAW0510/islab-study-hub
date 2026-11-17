import { describe, expect, it } from "vitest";
import { defaultView, VIEW_KEYS, viewDefinition, VIEWS_3D } from "./registry";

describe("3D view registry", () => {
  it("has unique keys, and the defaults are among them", () => {
    expect(new Set(VIEW_KEYS).size).toBe(VIEWS_3D.length);
    expect(VIEW_KEYS).toContain(defaultView(true));
    expect(VIEW_KEYS).toContain(defaultView(false));
  });

  it("describes every view completely enough for the shell", () => {
    for (const view of VIEWS_3D) {
      expect(view.label.length).toBeGreaterThan(0);
      expect(view.info.length).toBeGreaterThan(40);
      expect(["dark", "light", "choice"]).toContain(view.theme);
      expect(view.autoRotateSpeed).toBeGreaterThan(0);
      expect(view.background).toMatch(/var\(--/); // design tokens only
      expect(typeof view.create).toBe("function");
    }
    expect(viewDefinition("cube").boundaries).toBe(true);
  });
});
