import { describe, expect, it } from "vitest";
import { newTermsLine } from "./format";

describe("newTermsLine", () => {
  it("lists the week's terms with their count, in the given order", () => {
    expect(newTermsLine(["tensor", "backpropagation", "overfitting"])).toBe(
      "- Istilah baru minggu ini (3): tensor, backpropagation, overfitting",
    );
    expect(newTermsLine(["tensor"])).toBe("- Istilah baru minggu ini (1): tensor");
  });

  it("is empty when no term was learned, and skips blank names", () => {
    expect(newTermsLine([])).toBe("");
    expect(newTermsLine(["  ", ""])).toBe("");
    expect(newTermsLine([" tensor ", " "])).toBe("- Istilah baru minggu ini (1): tensor");
  });
});
