import { VOCAB_CONFIG } from "./vocab-config.ts";

/**
 * Builds the text that gets embedded for terms and for domain prototypes.
 * Pure TypeScript: used by the Edge Function and tested with Vitest.
 */

/** Markdown + LaTeX → plain text. Formula contents are kept, the `$` signs are not. */
export function stripMarkdown(markdown: string): string {
  return (
    markdown
      .replace(/\r\n/g, "\n")
      // fenced code: keep the code, drop the fence and language tag
      .replace(/```[^\n]*\n([\s\S]*?)```/g, "$1")
      .replace(/```/g, " ")
      // formulas: keep what is inside
      .replace(/\$\$([\s\S]+?)\$\$/g, " $1 ")
      .replace(/\$([^$\n]+)\$/g, "$1")
      // images and links: keep the visible text
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      // block markers at the start of a line: headings, quotes, lists, task boxes
      .replace(/^[ \t]*#{1,6}[ \t]+/gm, "")
      .replace(/^[ \t]*>[ \t]?/gm, "")
      .replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/gm, "")
      // table rules and pipes
      .replace(/^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(?:\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm, " ")
      .replace(/\|/g, " ")
      // emphasis, strikethrough, inline code
      .replace(/(\*\*|__|~~)(.+?)\1/g, "$2")
      .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=$|[\s).,;:!?])/g, "$1$2")
      .replace(/`([^`\n]+)`/g, "$1")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Cuts at a word boundary near `max` characters. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

export type TermTextInput = { term: string; aliases?: readonly string[] | null; definition?: string | null };

/** `"{istilah} ({alias, …}): {definisi}"`, as plain text, at most MAX_TEXT_CHARS long. */
export function termText(input: TermTextInput, maxChars: number = VOCAB_CONFIG.MAX_TEXT_CHARS): string {
  const term = input.term.trim();
  const aliases = (input.aliases ?? []).map((a) => a.trim()).filter(Boolean);
  const definition = stripMarkdown(input.definition ?? "");

  const head = aliases.length > 0 ? `${term} (${aliases.join(", ")})` : term;
  return truncate(definition ? `${head}: ${definition}` : head, maxChars);
}

export type DomainTextInput = { name: string; description?: string | null; examples?: readonly string[] | null };

/** `"{nama}: {deskripsi}. Contoh istilah: a, b, c"` — the text behind a domain prototype. */
export function domainPrototypeText(
  input: DomainTextInput,
  maxExamples: number = VOCAB_CONFIG.PROTOTYPE_EXAMPLES,
  maxChars: number = VOCAB_CONFIG.MAX_TEXT_CHARS,
): string {
  const name = input.name.trim();
  const description = stripMarkdown(input.description ?? "").replace(/[.\s]+$/, "");
  const examples = [...new Set((input.examples ?? []).map((e) => e.trim()).filter(Boolean))].slice(0, maxExamples);

  let text = description ? `${name}: ${description}` : name;
  if (examples.length > 0) text += `. Contoh istilah: ${examples.join(", ")}`;
  return truncate(text, maxChars);
}
