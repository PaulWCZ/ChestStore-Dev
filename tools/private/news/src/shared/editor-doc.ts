// Safe in the browser: no SDK here.
// The composer shows a post's text formatted as it will read (a Tiptap
// editor, app/chest/text-editor.tsx) while News keeps it as the plain text
// with a few marks of lib/markdown.ts — what search, the bell, email and
// excerpts read. toDoc turns that text into the editor's document; fromDoc
// writes the document back as text. Only what the text can say exists in
// the editor (paragraphs, subheadings, lists, quotes, bold, italic, links,
// pictures of the post), and fromDoc(toDoc(text)) keeps what it shows.
import { parse, type Block, type Inline } from "./markdown.ts";

export type Mark = { type: "bold" | "italic" | "link"; attrs?: { href?: string } };
export type DocNode = { type: string; attrs?: Record<string, unknown>; content?: DocNode[]; text?: string; marks?: Mark[] };

// The picture of a post as the editor shows it, and back.
export const pictureSrc = (fileId: string) => `/chest/files/${fileId}?size=1024`;
const pictureId = (src: unknown): string | null => {
  const m = typeof src === "string" ? /^\/chest\/files\/([1-9][0-9]{0,17})(\?|$)/u.exec(src) : null;
  return m ? m[1]! : null;
};

function inlineNodes(nodes: Inline[], marks: Mark[] = []): DocNode[] {
  const out: DocNode[] = [];
  for (const n of nodes) {
    if (n.t === "text") { if (n.v) out.push({ type: "text", text: n.v, ...(marks.length ? { marks } : {}) }); }
    else if (n.t === "br") out.push({ type: "hardBreak" });
    else if (n.t === "b") out.push(...inlineNodes(n.c, [...marks, { type: "bold" }]));
    else if (n.t === "i") out.push(...inlineNodes(n.c, [...marks, { type: "italic" }]));
    else out.push(...inlineNodes(n.c, [...marks, { type: "link", attrs: { href: n.href } }]));
  }
  return out;
}

const paragraph = (nodes: Inline[]): DocNode => {
  const content = inlineNodes(nodes);
  return content.length ? { type: "paragraph", content } : { type: "paragraph" };
};

function block(b: Block): DocNode {
  if (b.t === "p") return paragraph(b.c);
  if (b.t === "h") return { type: "heading", attrs: { level: 2 }, content: inlineNodes(b.c) };
  if (b.t === "quote") return { type: "blockquote", content: [paragraph(b.c)] };
  if (b.t === "img") return { type: "image", attrs: { src: pictureSrc(b.id), alt: b.alt || null } };
  const items = b.items.map(item => ({ type: "listItem", content: [paragraph(item)] }));
  return b.t === "ul" ? { type: "bulletList", content: items } : { type: "orderedList", attrs: { start: b.start }, content: items };
}

export function toDoc(text: string): DocNode {
  const blocks = parse(text).map(block);
  return { type: "doc", content: blocks.length ? blocks : [{ type: "paragraph" }] };
}

// Writing text back. A character that would be read as a mark is escaped
// (lib/markdown.ts reads \* as *); so is one that would start a list, a
// subheading or a quote at the start of a line.
const escapeText = (text: string) => text.replace(/[\\*_[\]]/gu, "\\$&");
function escapeLineStart(line: string): string {
  return line
    .replace(/^(\s*)([#>•-])/u, "$1\\$2")
    .replace(/^(\s*\d{1,6})([.)])(\s)/u, "$1\\$2$3")
    .replace(/^(\s*)!\\\[/u, "$1\\!\\[");
}

type Segment = { text: string; marks: Mark[] } | { br: true };
const key = (m: Mark) => (m.type === "link" ? "link:" + String(m.attrs?.href ?? "") : m.type);
// Links outside, then italic, then bold: "_**a**_" reads back, "***a***" would not.
const rank = (m: Mark) => (m.type === "link" ? 0 : m.type === "italic" ? 1 : 2);

function segments(nodes: DocNode[] = []): Segment[] {
  const out: Segment[] = [];
  for (const n of nodes) {
    if (n.type === "hardBreak") out.push({ br: true });
    else if (n.type === "text" && n.text) out.push({ text: n.text, marks: (n.marks ?? []).filter(m => m.type === "bold" || m.type === "italic" || (m.type === "link" && typeof m.attrs?.href === "string")).sort((a, b) => rank(a) - rank(b)) });
  }
  // Spaces at the edge of a mark go outside it ("**a** b", never "**a **b").
  const split: Segment[] = [];
  for (let i = 0; i < out.length; i++) {
    const s = out[i]!;
    if ("br" in s) { split.push(s); continue; }
    const prev = split.at(-1);
    const next = out[i + 1];
    const prevMarks = prev && !("br" in prev) ? prev.marks.map(key) : [];
    const nextMarks = next && !("br" in next) ? next.marks.map(key) : [];
    const lead = /^\s+/u.exec(s.text)?.[0] ?? "";
    const trail = s.text.length > lead.length ? /\s+$/u.exec(s.text)?.[0] ?? "" : "";
    const core = s.text.slice(lead.length, s.text.length - trail.length);
    if (lead) split.push({ text: lead, marks: s.marks.filter(m => prevMarks.includes(key(m))) });
    if (core) split.push({ text: core, marks: s.marks });
    if (trail) split.push({ text: trail, marks: s.marks.filter(m => nextMarks.includes(key(m))) });
  }
  return split;
}

function inlineText(nodes: DocNode[] = []): string {
  let out = "";
  let open: Mark[] = [];
  const close = (m: Mark) => (m.type === "link" ? `](${String(m.attrs!.href).replace(/[\s()]/gu, c => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"))})` : m.type === "bold" ? "**" : "_");
  const opening = (m: Mark) => (m.type === "link" ? "[" : m.type === "bold" ? "**" : "_");
  const closeFrom = (index: number) => {
    for (let k = open.length - 1; k >= index; k--) out += close(open[k]!);
    open = open.slice(0, index);
  };
  for (const s of segments(nodes)) {
    if ("br" in s) {
      closeFrom(0);
      out += "\n";
      continue;
    }
    const wanted = new Set(s.marks.map(key));
    // The marks already open and still wanted stay (outside); the others
    // close; the new ones open inside them.
    let same = 0;
    while (same < open.length && wanted.has(key(open[same]!))) same++;
    closeFrom(same);
    for (const m of s.marks.filter(m => !open.some(o => key(o) === key(m)))) {
      out += opening(m);
      open.push(m);
    }
    out += escapeText(s.text);
  }
  closeFrom(0);
  return out.split("\n").map(escapeLineStart).join("\n");
}

function listItemText(item: DocNode): string {
  // An item is one line: its paragraphs joined, a list inside it flattened.
  return (item.content ?? []).map(c => (c.type === "paragraph" ? inlineText(c.content).replace(/\n/gu, " ") : "")).filter(Boolean).join(" ");
}

function blockText(n: DocNode): string[] {
  if (n.type === "paragraph") return [inlineText(n.content)];
  if (n.type === "heading") return ["## " + inlineText(n.content).replace(/\n/gu, " ")];
  if (n.type === "blockquote") return [(n.content ?? []).flatMap(blockText).join("\n").split("\n").map(l => "> " + l.replace(/^> /u, "")).join("\n")];
  if (n.type === "image") {
    const idOf = pictureId(n.attrs?.["src"]);
    const alt = typeof n.attrs?.["alt"] === "string" ? n.attrs["alt"].replace(/[[\]\\\s]+/gu, " ").trim().slice(0, 200) : "";
    return idOf ? [`![${alt}](image:${idOf})`] : [];
  }
  if (n.type === "bulletList" || n.type === "orderedList") {
    const start = n.type === "orderedList" ? Number(n.attrs?.["start"] ?? 1) || 1 : 1;
    const lines: string[] = [];
    for (const [k, item] of (n.content ?? []).entries()) {
      lines.push((n.type === "bulletList" ? "- " : `${start + k}. `) + listItemText(item));
      for (const inner of item.content ?? []) if (inner.type === "bulletList" || inner.type === "orderedList") lines.push(...blockText(inner));
    }
    return [lines.join("\n")];
  }
  return [];
}

export function fromDoc(doc: DocNode): string {
  return (doc.content ?? []).flatMap(blockText).filter(b => b.trim() !== "").join("\n\n").trim();
}
