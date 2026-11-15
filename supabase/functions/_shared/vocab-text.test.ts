import { describe, expect, it } from "vitest";
import { domainPrototypeText, stripMarkdown, termText, truncate } from "./vocab-text.ts";

describe("stripMarkdown", () => {
  it("keeps formula contents and drops the dollar signs", () => {
    expect(stripMarkdown("Gradien $\\nabla_\\theta J$ dipakai di $$\\theta := \\theta - \\alpha \\nabla J$$")).toBe(
      "Gradien \\nabla_\\theta J dipakai di \\theta := \\theta - \\alpha \\nabla J",
    );
  });

  it("removes headings, lists, quotes, emphasis and inline code markers", () => {
    const md = ["## Ringkasan", "- **Tensor** adalah `array` *multidimensi*", "> catatan", "1. satu", "- [x] selesai"].join("\n");
    expect(stripMarkdown(md)).toBe("Ringkasan Tensor adalah array multidimensi catatan satu selesai");
  });

  it("keeps link and image text, and code inside fences", () => {
    expect(stripMarkdown("Lihat [dokumentasi](https://example.com) ![diagram](a.png)")).toBe("Lihat dokumentasi diagram");
    expect(stripMarkdown("```python\nloss.backward()\n```")).toBe("loss.backward()");
  });

  it("flattens tables", () => {
    expect(stripMarkdown("| a | b |\n|---|---|\n| 1 | 2 |")).toBe("a b 1 2");
  });

  it("does not eat underscores and asterisks inside words or formulas", () => {
    expect(stripMarkdown("snake_case_name dan 2*3*4")).toBe("snake_case_name dan 2*3*4");
  });
});

describe("truncate", () => {
  it("cuts at a word boundary", () => {
    expect(truncate("satu dua tiga empat", 12)).toBe("satu dua");
    expect(truncate("pendek", 12)).toBe("pendek");
  });

  it("cuts hard when there is no reasonable boundary", () => {
    expect(truncate("a".repeat(30), 10)).toBe("a".repeat(10));
  });
});

describe("termText", () => {
  it("follows the format `istilah (alias, …): definisi`", () => {
    expect(
      termText({ term: "Stochastic Gradient Descent", aliases: ["SGD"], definition: "Optimisasi dengan **mini-batch**." }),
    ).toBe("Stochastic Gradient Descent (SGD): Optimisasi dengan mini-batch.");
  });

  it("leaves out the parts that are missing", () => {
    expect(termText({ term: " tensor ", aliases: [], definition: "Struktur data multidimensi" })).toBe(
      "tensor: Struktur data multidimensi",
    );
    expect(termText({ term: "tensor", aliases: [" ", "array-ND"], definition: "" })).toBe("tensor (array-ND)");
    expect(termText({ term: "tensor", aliases: null, definition: null })).toBe("tensor");
  });

  it("stays within the character limit", () => {
    const text = termText({ term: "x", definition: "kata ".repeat(500) }, 100);
    expect(text.length).toBeLessThanOrEqual(100);
    expect(text.startsWith("x: kata kata")).toBe(true);
  });
});

describe("domainPrototypeText", () => {
  it("joins name, description and example terms", () => {
    expect(
      domainPrototypeText({
        name: "Deep Learning",
        description: "Jaringan saraf tiruan: tensor, layer, backpropagation.",
        examples: ["tensor", "backpropagation", "tensor", " "],
      }),
    ).toBe("Deep Learning: Jaringan saraf tiruan: tensor, layer, backpropagation. Contoh istilah: tensor, backpropagation");
  });

  it("works with a name only and caps the examples", () => {
    expect(domainPrototypeText({ name: "NLP" })).toBe("NLP");
    expect(domainPrototypeText({ name: "NLP", examples: ["a", "b", "c"] }, 2)).toBe("NLP. Contoh istilah: a, b");
  });
});
