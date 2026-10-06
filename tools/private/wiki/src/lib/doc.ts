import { AppError } from "./errors.ts";

// A page's content: ProseMirror JSON, as the editor (Tiptap) writes it. The
// server never trusts it: normalize() keeps only the nodes, marks and
// attributes below, with their bounds, and drops the rest. What is stored
// is what normalize() answered; the HTML a reader sees is made from it by
// lib/render.ts, never taken from a person.
//
// Nodes: paragraph, heading (levels 1–3, shown under the page's title),
// blockquote, callout (tone info/tip/warning), bulletList, orderedList,
// listItem, taskList, taskItem, codeBlock, horizontalRule, image (a file of
// the page), table, tableRow, tableHeader, tableCell; inline: text,
// hardBreak, pageRef (a link to another page, shown with its current title).
// Marks: bold, italic, underline, strike, code, link (http, https, mailto,
// or a page or file of this wiki).

import { docLimits, tones, emptyDoc, safeHref, safeImage, pageIdOfHref, fileIdOfHref, type Mark, type DocNode, type Doc } from "../shared/doc.ts";

export { docLimits, tones, emptyDoc, safeHref, safeImage, pageIdOfHref, fileIdOfHref, type Mark, type DocNode, type Doc } from "../shared/doc.ts";

type Content = "inline" | "block" | "listItem" | "taskItem" | "tableRow" | "cell" | "text" | "none";
const blocks: Record<string, Content> = {
  paragraph: "inline",
  heading: "inline",
  blockquote: "block",
  callout: "block",
  bulletList: "listItem",
  orderedList: "listItem",
  taskList: "taskItem",
  codeBlock: "text",
  horizontalRule: "none",
  image: "none",
  table: "tableRow",
};
const inner: Record<string, Content> = { listItem: "block", taskItem: "block", tableRow: "cell", tableCell: "block", tableHeader: "block" };
const inlineTypes = new Set(["text", "hardBreak", "pageRef"]);
const markTypes = ["bold", "italic", "underline", "strike", "code", "link"] as const;

const idPattern = /^[1-9][0-9]{0,17}$/u;
const str = (value: unknown, max: number): string => (typeof value === "string" ? [...value.replace(/\p{Cc}/gu, " ")].slice(0, max).join("") : "");

// dropped counts what normalize() had to leave out that a person would
// miss: pictures from outside the wiki (the save says so).
type Budget = { nodes: number; text: number; dropped?: Dropped };
export type Dropped = { pictures: number };

function marksOf(value: unknown): Mark[] {
  if (!Array.isArray(value)) return [];
  const found: Mark[] = [];
  for (const m of value.slice(0, 8)) {
    if (!m || typeof m !== "object") continue;
    const type = (m as Mark).type;
    if (!(markTypes as readonly string[]).includes(type) || found.some(f => f.type === type)) continue;
    if (type === "link") {
      const href = safeHref((m as Mark).attrs?.["href"]);
      if (href) found.push({ type, attrs: { href } });
      continue;
    }
    found.push({ type });
  }
  // Code is shown as it is: no other mark but a link inside it.
  return found.some(f => f.type === "code") ? found.filter(f => f.type === "code" || f.type === "link") : found;
}

function inline(value: unknown, budget: Budget, plain: boolean): DocNode[] {
  if (!Array.isArray(value)) return [];
  const out: DocNode[] = [];
  for (const n of value) {
    if (!n || typeof n !== "object" || --budget.nodes < 0) continue;
    const node = n as DocNode;
    if (node.type === "text") {
      let text = typeof node.text === "string" ? node.text : "";
      text = plain ? text.replace(/\r\n?/gu, "\n").replace(/[^\P{Cc}\n\t]/gu, "") : text.replace(/[\r\n\t]+/gu, " ").replace(/\p{Cc}/gu, "");
      if (text === "") continue;
      budget.text -= text.length;
      if (budget.text < 0) throw new AppError("too_long", { max: docLimits.text });
      const marks = plain ? [] : marksOf(node.marks);
      const last = out.at(-1);
      // Neighbours with the same marks become one text.
      if (last?.type === "text" && JSON.stringify(last.marks ?? []) === JSON.stringify(marks)) last.text += text;
      else out.push(marks.length > 0 ? { type: "text", text, marks } : { type: "text", text });
    } else if (!plain && node.type === "hardBreak") out.push({ type: "hardBreak" });
    else if (!plain && node.type === "pageRef") {
      const id = String(node.attrs?.["id"] ?? "");
      if (idPattern.test(id)) out.push({ type: "pageRef", attrs: { id } });
    }
  }
  return out;
}

function attrsOf(type: string, attrs: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const a = attrs ?? {};
  switch (type) {
    case "heading": {
      const level = Number(a["level"]);
      return { level: Number.isInteger(level) ? Math.min(Math.max(level, 1), 3) : 1 };
    }
    case "orderedList": {
      const start = Number(a["start"]);
      return { start: Number.isInteger(start) && start >= 0 && start <= 100000 ? start : 1 };
    }
    case "taskItem":
      return { checked: a["checked"] === true };
    case "codeBlock": {
      const language = typeof a["language"] === "string" && /^[a-z0-9+#-]{1,24}$/iu.test(a["language"]) ? a["language"].toLowerCase() : null;
      return language ? { language } : undefined;
    }
    case "callout":
      return { tone: (tones as readonly unknown[]).includes(a["tone"]) ? a["tone"] : "info" };
    case "tableCell":
    case "tableHeader": {
      const span = (v: unknown) => (Number.isInteger(Number(v)) ? Math.min(Math.max(Number(v), 1), 20) : 1);
      const colspan = span(a["colspan"]);
      const rowspan = span(a["rowspan"]);
      return colspan === 1 && rowspan === 1 ? undefined : { colspan, rowspan };
    }
    default:
      return undefined;
  }
}

function node(type: string, attrs: Record<string, unknown> | undefined, content?: DocNode[]): DocNode {
  return { type, ...(attrs ? { attrs } : {}), ...(content && content.length > 0 ? { content } : {}) };
}

// children normalizes a list of nodes for a place that holds `kind`.
function children(value: unknown, kind: Content, budget: Budget, depth: number): DocNode[] {
  if (kind === "none") return [];
  if (kind === "inline" || kind === "text") return inline(value, budget, kind === "text");
  if (!Array.isArray(value)) return [];
  if (depth > docLimits.depth) throw new AppError("too_long", { max: docLimits.depth });
  const out: DocNode[] = [];
  let loose: unknown[] = [];
  const flush = () => {
    if (loose.length === 0) return;
    const text = inline(loose, budget, false);
    loose = [];
    if (text.length > 0) place({ type: "paragraph", content: text });
  };
  // place puts a normalized block where this list holds `kind`, wrapping it
  // in a list item or a cell when the place asks for one.
  const place = (n: DocNode) => {
    if (kind === "block") out.push(n);
    else if (kind === "listItem") out.push(node("listItem", undefined, [n]));
    else if (kind === "taskItem") out.push(node("taskItem", { checked: false }, [n]));
    else if (kind === "cell") out.push(node("tableCell", undefined, [n]));
    else if (kind === "tableRow") out.push(node("tableRow", undefined, [node("tableCell", undefined, [n])]));
  };
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const n = raw as DocNode;
    if (inlineTypes.has(n.type)) {
      loose.push(n);
      continue;
    }
    flush();
    if (--budget.nodes < 0) throw new AppError("too_long", { max: docLimits.nodes });
    const t = n.type;
    if (t in blocks) {
      const made = block(n, budget, depth + 1);
      if (made) place(made);
    } else if (t in inner) {
      const own = inner[t]!;
      const fits = (kind === "listItem" && t === "listItem") || (kind === "taskItem" && t === "taskItem") || (kind === "tableRow" && t === "tableRow") || (kind === "cell" && (t === "tableCell" || t === "tableHeader"));
      let content = children(n.content, own, budget, depth + 1);
      if (fits) {
        if (own === "block") {
          // A list item starts with a paragraph (the editor's rule); a cell holds at least one.
          if (t === "listItem" || t === "taskItem") {
            if (content[0]?.type !== "paragraph") content = [{ type: "paragraph" }, ...content];
          } else if (content.length === 0) content = [{ type: "paragraph" }];
        }
        if (own === "cell" && content.length === 0) continue;
        out.push(node(t, attrsOf(t, n.attrs), content));
      } else if (own === "block") {
        // An item or a cell out of its place: its blocks, in order.
        for (const c of content) place(c);
      }
    }
  }
  flush();
  return out;
}

function block(n: DocNode, budget: Budget, depth: number): DocNode | null {
  const kind = blocks[n.type]!;
  const attrs = attrsOf(n.type, n.attrs);
  if (n.type === "image") {
    const src = safeImage(n.attrs?.["src"]);
    if (!src) {
      if (budget.dropped) budget.dropped.pictures++;
      return null;
    }
    const alt = str(n.attrs?.["alt"], 300);
    const title = str(n.attrs?.["title"], 300);
    return { type: "image", attrs: { src, ...(alt ? { alt } : {}), ...(title ? { title } : {}) } };
  }
  const content = children(n.content, kind, budget, depth);
  if (kind === "listItem" || kind === "taskItem" || kind === "tableRow") {
    if (content.length === 0) return null;
  }
  if (n.type === "table") {
    // Every row as wide as the widest, so the table draws square.
    const width = Math.max(...content.map(r => (r.content ?? []).reduce((w, c) => w + Number(c.attrs?.["colspan"] ?? 1), 0)));
    for (const row of content) {
      const w = (row.content ?? []).reduce((s, c) => s + Number(c.attrs?.["colspan"] ?? 1), 0);
      const cellType = row.content?.[0]?.type ?? "tableCell";
      for (let i = w; i < width; i++) (row.content ??= []).push(node(cellType === "tableHeader" ? "tableHeader" : "tableCell", undefined, [{ type: "paragraph" }]));
    }
  }
  if ((n.type === "blockquote" || n.type === "callout") && content.length === 0) return node(n.type, attrs, [{ type: "paragraph" }]);
  return node(n.type, attrs, content);
}

// normalize checks a document a person sent and answers the one to store.
// `dropped`, when given, counts the pictures it left out.
export function normalize(value: unknown, dropped?: Dropped): Doc {
  let raw = value;
  if (typeof raw === "string") {
    if (raw.length > docLimits.bytes) throw new AppError("too_long", { max: docLimits.text });
    try {
      raw = JSON.parse(raw);
    } catch {
      throw new AppError("invalid");
    }
  }
  if (!raw || typeof raw !== "object" || (raw as DocNode).type !== "doc") throw new AppError("invalid");
  if (JSON.stringify(raw).length > docLimits.bytes) throw new AppError("too_long", { max: docLimits.text });
  const content = children((raw as DocNode).content, "block", { nodes: docLimits.nodes, text: docLimits.text, ...(dropped ? { dropped } : {}) }, 0);
  return { type: "doc", content: content.length > 0 ? content : [{ type: "paragraph" }] };
}

// The words of a node, for search, snippets and titles.
function textOf(n: DocNode, titles?: (id: string) => string | undefined): string {
  if (n.type === "text") return n.text ?? "";
  if (n.type === "hardBreak") return "\n";
  if (n.type === "pageRef") return titles?.(String(n.attrs?.["id"])) ?? "";
  if (n.type === "image") return String(n.attrs?.["alt"] ?? "");
  return (n.content ?? []).map(c => textOf(c, titles)).join("");
}

// lines gives a page's content as one line per block, a mark at the start
// of list items and quotes: what search reads and what the history compares.
export function lines(doc: Doc, titles?: (id: string) => string | undefined): string[] {
  const out: string[] = [];
  const walk = (nodes: DocNode[], prefix: string) => {
    for (const n of nodes) {
      switch (n.type) {
        case "bulletList":
        case "orderedList":
        case "taskList": {
          let number = Number(n.attrs?.["start"] ?? 1);
          for (const item of n.content ?? []) {
            const mark = n.type === "bulletList" ? "• " : n.type === "orderedList" ? `${number++}. ` : item.attrs?.["checked"] ? "☑ " : "☐ ";
            const [first, ...rest] = item.content ?? [];
            out.push(prefix + mark + (first ? textOf(first, titles) : "").replace(/\n/gu, " "));
            walk(rest, prefix + "  ");
          }
          break;
        }
        case "blockquote":
        case "callout":
          walk(n.content ?? [], prefix + "│ ");
          break;
        case "table":
          for (const row of n.content ?? []) out.push(prefix + (row.content ?? []).map(c => textOf(c, titles).replace(/\n/gu, " ")).join(" │ "));
          break;
        case "codeBlock":
          for (const line of textOf(n).split("\n")) out.push(prefix + line);
          break;
        case "horizontalRule":
          out.push(prefix + "───");
          break;
        case "image":
          out.push(prefix + "🖼 " + textOf(n));
          break;
        default: {
          const text = textOf(n, titles).replace(/\n/gu, " ");
          out.push(prefix + (n.type === "heading" ? "#".repeat(Number(n.attrs?.["level"] ?? 1)) + " " : "") + text);
        }
      }
    }
  };
  walk(doc.content, "");
  // A blank paragraph is not a line worth comparing.
  return out.filter(l => l.trim() !== "");
}

// plainText is what search reads: the page's words, one block a line.
export function plainText(doc: Doc, titles?: (id: string) => string | undefined): string {
  return lines(doc, titles).map(l => l.replace(/^(?:[\s│•☐☑#🖼]|\d+\.\s)+/u, "").trim()).filter(l => l !== "" && l !== "───").join("\n").slice(0, docLimits.text);
}

// The pages and files a document points to.
export function references(doc: Doc): { pages: string[]; files: string[] } {
  const pages = new Set<string>();
  const files = new Set<string>();
  const walk = (n: DocNode) => {
    if (n.type === "pageRef") pages.add(String(n.attrs?.["id"]));
    if (n.type === "image") {
      const f = fileIdOfHref(String(n.attrs?.["src"] ?? ""));
      if (f) files.add(f);
    }
    for (const m of n.marks ?? []) {
      if (m.type !== "link") continue;
      const href = String(m.attrs?.["href"] ?? "");
      const p = pageIdOfHref(href);
      if (p) pages.add(p);
      const f = fileIdOfHref(href);
      if (f) files.add(f);
    }
    for (const c of n.content ?? []) walk(c);
  };
  for (const c of doc.content) walk(c);
  return { pages: [...pages], files: [...files] };
}

// mapDoc rewrites a document's nodes (for imports: links between the
// imported files become links between the new pages).
export function mapDoc(doc: Doc, fn: (n: DocNode) => DocNode | null): Doc {
  const walk = (nodes: DocNode[]): DocNode[] => nodes.flatMap(n => {
    const m = fn(n);
    if (!m) return [];
    return [m.content ? { ...m, content: walk(m.content) } : m];
  });
  return { type: "doc", content: walk(doc.content) };
}

// A heading's anchor: its words, lower case, joined by dashes; the same
// for the table of contents and for links to a part of a page.
export function slug(text: string): string {
  const s = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 60);
  return s || "section";
}
