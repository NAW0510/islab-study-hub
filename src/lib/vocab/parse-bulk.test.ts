import { describe, expect, it } from "vitest";
import { BULK_MAX_LINES, parseBulk, splitTermLine } from "./parse-bulk";

describe("splitTermLine", () => {
  it("recognises each separator", () => {
    expect(splitTermLine("tensor — struktur data multidimensi")).toEqual({ term: "tensor", definition: "struktur data multidimensi" });
    expect(splitTermLine("tensor – struktur data")).toEqual({ term: "tensor", definition: "struktur data" });
    expect(splitTermLine("tensor - struktur data")).toEqual({ term: "tensor", definition: "struktur data" });
    expect(splitTermLine("tensor: struktur data")).toEqual({ term: "tensor", definition: "struktur data" });
    expect(splitTermLine("tensor\tstruktur data")).toEqual({ term: "tensor", definition: "struktur data" });
  });

  it("splits at the separator that comes first", () => {
    expect(splitTermLine("p-value: peluang - bila H0 benar")).toEqual({ term: "p-value", definition: "peluang - bila H0 benar" });
    expect(splitTermLine("Kernel (SVM) - fungsi kemiripan: k(x, y)")).toEqual({
      term: "Kernel (SVM)",
      definition: "fungsi kemiripan: k(x, y)",
    });
  });

  it("lets a tab win over separators inside the cells", () => {
    expect(splitTermLine("SGD: varian\toptimisasi - dengan mini-batch")).toEqual({
      term: "SGD: varian",
      definition: "optimisasi - dengan mini-batch",
    });
  });

  it("does not split on hyphens or colons inside a word", () => {
    expect(splitTermLine("k-means")).toEqual({ term: "k-means", definition: "" });
    expect(splitTermLine("rasio 3:1")).toEqual({ term: "rasio 3:1", definition: "" });
  });

  it("strips list markers and extra spaces", () => {
    expect(splitTermLine("  1. tensor  -  struktur data ")).toEqual({ term: "tensor", definition: "struktur data" });
    expect(splitTermLine("- [x] back   propagation")).toEqual({ term: "back propagation", definition: "" });
    expect(splitTermLine("* overfitting: terlalu menghafal")).toEqual({ term: "overfitting", definition: "terlalu menghafal" });
  });

  it("returns null for empty lines", () => {
    expect(splitTermLine("   ")).toBeNull();
    expect(splitTermLine("- ")).toBeNull();
  });
});

describe("parseBulk", () => {
  it("parses one term per line and keeps the original line numbers", () => {
    const { rows, overflow } = parseBulk("tensor - struktur data\n\noverfitting: terlalu menghafal\n");
    expect(overflow).toBe(0);
    expect(rows).toEqual([
      { line: 1, term: "tensor", definition: "struktur data", warnings: [], ok: true },
      { line: 3, term: "overfitting", definition: "terlalu menghafal", warnings: [], ok: true },
    ]);
  });

  it("warns about a missing definition but still allows saving", () => {
    expect(parseBulk("epoch").rows[0]).toMatchObject({ warnings: ["definisi-kosong"], ok: true });
  });

  it("flags duplicates inside the paste and against existing terms or aliases", () => {
    const { rows } = parseBulk("Tensor - a\ntensor - b\nSGD - c\nbaru - d", ["sgd", "Stochastic Gradient Descent"]);
    expect(rows.map((r) => [r.term, r.warnings, r.ok])).toEqual([
      ["Tensor", [], true],
      ["tensor", ["duplikat-di-tempelan"], false],
      ["SGD", ["sudah-ada"], false],
      ["baru", [], true],
    ]);
  });

  it("rejects terms that are too long", () => {
    const { rows } = parseBulk(`${"x".repeat(121)} - definisi`);
    expect(rows[0]).toMatchObject({ warnings: ["terlalu-panjang"], ok: false });
  });

  it("stops at the maximum and reports the overflow", () => {
    const text = Array.from({ length: BULK_MAX_LINES + 7 }, (_, i) => `istilah ${i + 1} - definisi`).join("\n");
    const { rows, overflow } = parseBulk(text);
    expect(rows).toHaveLength(BULK_MAX_LINES);
    expect(overflow).toBe(7);
  });

  it("handles Windows line endings", () => {
    expect(parseBulk("a - satu\r\nb - dua\r\n").rows.map((r) => r.term)).toEqual(["a", "b"]);
  });
});
