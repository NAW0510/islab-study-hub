import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IRunOptions,
  type ParagraphChild,
} from "docx";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import {
  formatPeriod,
  groupLabel,
  hasProjectContent,
  LEARNING_SECTIONS,
  PROJECT_SECTIONS,
  reportTitle,
  weekLabel,
} from "./report-template";
import type { ReportProfile, WeeklyReport } from "./types";

/** The subset of mdast we render. */
type MdNode = {
  type: string;
  value?: string;
  url?: string;
  depth?: number;
  ordered?: boolean | null;
  checked?: boolean | null;
  children?: MdNode[];
};

type RunStyle = Pick<IRunOptions, "bold" | "italics" | "strike" | "font" | "shading" | "color" | "style">;

const MONO = "Consolas";
const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);

class Builder {
  private orderedLists = 0;

  inline(nodes: MdNode[] = [], style: RunStyle = {}): ParagraphChild[] {
    return nodes.flatMap((node): ParagraphChild[] => {
      switch (node.type) {
        case "text":
          return [new TextRun({ text: node.value ?? "", ...style })];
        case "strong":
          return this.inline(node.children, { ...style, bold: true });
        case "emphasis":
          return this.inline(node.children, { ...style, italics: true });
        case "delete":
          return this.inline(node.children, { ...style, strike: true });
        case "inlineCode":
          return [
            new TextRun({
              text: node.value ?? "",
              ...style,
              font: MONO,
              shading: { type: ShadingType.CLEAR, fill: "EFEFE9", color: "auto" },
            }),
          ];
        case "inlineMath":
          return [new TextRun({ text: node.value ?? "", ...style, italics: true, font: "Cambria Math" })];
        case "break":
          return [new TextRun({ text: "", break: 1 })];
        case "link":
          return [
            new ExternalHyperlink({
              link: node.url ?? "",
              children: this.inline(node.children, { ...style, style: "Hyperlink" }) as TextRun[],
            }),
          ];
        case "image":
          return [new TextRun({ text: `[gambar: ${node.url ?? ""}]`, ...style, italics: true })];
        default:
          return node.children ? this.inline(node.children, style) : node.value ? [new TextRun({ text: node.value, ...style })] : [];
      }
    });
  }

  blocks(nodes: MdNode[] = [], listLevel = 0): (Paragraph | Table)[] {
    return nodes.flatMap((node): (Paragraph | Table)[] => {
      switch (node.type) {
        case "paragraph":
          return [new Paragraph({ children: this.inline(node.children), spacing: { after: 100 } })];
        case "heading":
          return [
            new Paragraph({
              children: this.inline(node.children, { bold: true }),
              spacing: { before: 160, after: 80 },
            }),
          ];
        case "list":
          return this.list(node, listLevel);
        case "code":
          return (node.value ?? "").split("\n").map(
            (line) =>
              new Paragraph({
                children: [new TextRun({ text: line || " ", font: MONO, size: 18 })],
                shading: { type: ShadingType.CLEAR, fill: "F3F3EF", color: "auto" },
                spacing: { after: 0 },
              }),
          );
        case "math":
          return [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: node.value ?? "", italics: true, font: "Cambria Math" })],
              spacing: { before: 80, after: 120 },
            }),
          ];
        case "table":
          return [this.table(node)];
        case "thematicBreak":
          return [
            new Paragraph({
              children: [],
              border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC", space: 1 } },
            }),
          ];
        case "html":
          return [new Paragraph({ children: [new TextRun(node.value ?? "")] })];
        default:
          return node.children ? this.blocks(node.children, listLevel) : [];
      }
    });
  }

  private list(node: MdNode, level: number): (Paragraph | Table)[] {
    const ordered = Boolean(node.ordered);
    // Each ordered list gets its own instance so numbering restarts at 1.
    const instance = ordered ? ++this.orderedLists : 0;
    return (node.children ?? []).flatMap((item) => {
      const [first, ...rest] = item.children ?? [];
      const checkbox = item.checked === true ? "☑ " : item.checked === false ? "☐ " : "";
      const firstRuns = first?.type === "paragraph" ? this.inline(first.children) : [];
      const head = new Paragraph({
        children: [...(checkbox ? [new TextRun(checkbox)] : []), ...firstRuns],
        numbering: { reference: ordered ? "numbers" : "bullets", level: Math.min(level, 8), instance },
        spacing: { after: 60 },
      });
      const tail = first && first.type !== "paragraph" ? [first, ...rest] : rest;
      return [head, ...this.blocks(tail, level + 1)];
    });
  }

  private table(node: MdNode): Table {
    const rows = node.children ?? [];
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: rows.map(
        (row, rowIndex) =>
          new TableRow({
            tableHeader: rowIndex === 0,
            children: (row.children ?? []).map(
              (cell) =>
                new TableCell({
                  children: [new Paragraph({ children: this.inline(cell.children, rowIndex === 0 ? { bold: true } : {}) })],
                  shading: rowIndex === 0 ? { type: ShadingType.CLEAR, fill: "F1F1EC", color: "auto" } : undefined,
                }),
            ),
          }),
      ),
    });
  }

  markdown(md: string): (Paragraph | Table)[] {
    if (!md.trim()) return [new Paragraph({ children: [new TextRun({ text: "—", color: "888888" })] })];
    const tree = parser.parse(md) as unknown as MdNode;
    return this.blocks(tree.children);
  }
}

function infoRow(label: string, value: string) {
  const cell = (text: string, bold: boolean, width: number) =>
    new TableCell({
      width: { size: width, type: WidthType.PERCENTAGE },
      children: [new Paragraph({ children: [new TextRun({ text, bold })] })],
      borders: {
        top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        bottom: { style: BorderStyle.SINGLE, size: 2, color: "E2E2DA" },
        left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      },
    });
  return new TableRow({ children: [cell(label, true, 25), cell(value, false, 75)] });
}

function sectionBlock(builder: Builder, sections: typeof LEARNING_SECTIONS, report: WeeklyReport, skipEmpty: boolean) {
  // Keep the guidebook's numbering even when empty questions are skipped.
  return sections
    .map((s, i) => ({ s, number: i + 1 }))
    .filter(({ s }) => !skipEmpty || report[s.key].trim())
    .flatMap(({ s, number }) => [
      new Paragraph({ text: `${number}. ${s.label}`, heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 80 } }),
      ...builder.markdown(report[s.key]),
    ]);
}

export async function buildReportDocx(report: WeeklyReport, profile: ReportProfile | null): Promise<Buffer> {
  const builder = new Builder();

  const info: [string, string][] = [];
  if (profile?.full_name) info.push(["Nama", profile.full_name]);
  const group = groupLabel(profile);
  if (group) info.push(["Kelompok", group]);
  info.push(["Week", `${weekLabel(report.week_number)} (${formatPeriod(report.period_start, report.period_end)})`]);
  if (profile?.mentor_name) info.push(["Mentor", profile.mentor_name]);

  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: "Weekly Progress Report", heading: HeadingLevel.TITLE }),
    new Paragraph({
      children: [new TextRun({ text: "Intelligent Systems Lab FILKOM — Intern 2026", color: "666666" })],
      spacing: { after: 240 },
    }),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: info.map(([l, v]) => infoRow(l, v)) }),
    new Paragraph({ text: "Learning Progress", heading: HeadingLevel.HEADING_1, spacing: { before: 360 } }),
    ...sectionBlock(builder, LEARNING_SECTIONS, report, false),
  ];

  if (hasProjectContent(report)) {
    children.push(
      new Paragraph({ text: "Project Progress", heading: HeadingLevel.HEADING_1, spacing: { before: 360 } }),
      ...sectionBlock(builder, PROJECT_SECTIONS, report, true),
    );
  }

  if (report.links.trim()) {
    children.push(
      new Paragraph({ text: "Tautan & Lampiran", heading: HeadingLevel.HEADING_1, spacing: { before: 360 } }),
      ...builder.markdown(report.links),
    );
  }

  const bulletLevels = Array.from({ length: 9 }, (_, level) => ({
    level,
    format: LevelFormat.BULLET,
    text: ["•", "◦", "▪"][level % 3],
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 360 * (level + 1), hanging: 260 } } },
  }));
  const numberLevels = Array.from({ length: 9 }, (_, level) => ({
    level,
    format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][level % 3],
    text: `%${level + 1}.`,
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 360 * (level + 1), hanging: 300 } } },
  }));

  const doc = new Document({
    creator: profile?.full_name ?? "IS Lab Study Hub",
    title: reportTitle(report, profile),
    styles: {
      default: { document: { run: { font: "Calibri", size: 22 } } },
    },
    numbering: {
      config: [
        { reference: "bullets", levels: bulletLevels },
        { reference: "numbers", levels: numberLevels },
      ],
    },
    sections: [
      {
        properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

export function docxResponse(buffer: Buffer, fileName: string) {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="report.docx"; filename*=UTF-8''${encodeURIComponent(`${fileName}.docx`)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
