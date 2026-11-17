import { describe, expect, it } from "vitest";
import { FIELD_LABELS, fieldLabels, type FieldLabel } from "./common";

const label = (fieldId: string | null, count: number): FieldLabel => ({ key: `k:${fieldId}`, text: `${fieldId} ${count}`, priority: 950, fieldId, count });

describe("fieldLabels", () => {
  const labels = [label("a", 50), label("b", 40), label("c", 30), label("d", 20), label("e", 10), label("f", 5), label("g", 1), label(null, 3)];

  it("shows the five biggest fields faintly and hides the rest", () => {
    const shown = fieldLabels(labels, new Set());
    expect(shown.map((l) => l.key)).toEqual(["k:a", "k:b", "k:c", "k:d", "k:e"]);
    for (const l of shown) expect(l.opacity).toBe(FIELD_LABELS.opacity);
  });

  it("shows a focused field at full strength, also outside the top five or without a domain", () => {
    const shown = fieldLabels(labels, new Set(["g", "a", null]));
    expect(shown.find((l) => l.key === "k:g")).toMatchObject({ opacity: 1 });
    expect(shown.find((l) => l.key === "k:a")).toMatchObject({ opacity: 1, priority: 960 });
    expect(shown.find((l) => l.key === "k:null")).toMatchObject({ opacity: 1 });
    expect(shown.find((l) => l.key === "k:b")).toMatchObject({ opacity: FIELD_LABELS.opacity });
    expect(shown.some((l) => l.key === "k:f")).toBe(false);
  });
});
