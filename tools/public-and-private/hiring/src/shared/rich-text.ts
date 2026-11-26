// Safe in the browser: no SDK here.
// A job's description as recruiters write it — plain text with a few marks
// anyone can type — read into blocks the pages render as React elements.
// There is no HTML anywhere: whatever is written is shown as text, so a
// description can never carry a script or a link to somewhere else.
//
//   ## A heading           → a heading
//   - an item / * an item  → a bulleted list
//   1. an item             → a numbered list
//   **bold**               → bold, inside any line
//   a blank line           → a new paragraph
export type Inline = { text: string; bold: boolean };
export type Block =
  | { kind: "heading"; content: Inline[] }
  | { kind: "paragraph"; lines: Inline[][] }
  | { kind: "bullets"; items: Inline[][] }
  | { kind: "numbers"; items: Inline[][] };

export function inline(text: string): Inline[] {
  const parts: Inline[] = [];
  const pattern = /\*\*(.+?)\*\*/gu;
  let at = 0;
  for (const m of text.matchAll(pattern)) {
    if (m.index > at) parts.push({ text: text.slice(at, m.index), bold: false });
    parts.push({ text: m[1]!, bold: true });
    at = m.index + m[0].length;
  }
  if (at < text.length) parts.push({ text: text.slice(at), bold: false });
  return parts.filter(p => p.text !== "");
}

const bullet = /^\s*[-*•]\s+(.*)$/u;
const numbered = /^\s*\d{1,3}[.)]\s+(.*)$/u;
const heading = /^\s*#{1,3}\s+(.*)$/u;

export function parse(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: Inline[][] | null = null;
  const close = () => {
    if (paragraph && paragraph.length > 0) blocks.push({ kind: "paragraph", lines: paragraph });
    paragraph = null;
  };
  for (const raw of source.replace(/\r\n?/gu, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      close();
      continue;
    }
    const h = heading.exec(line), b = bullet.exec(line), n = numbered.exec(line);
    if (h) {
      close();
      blocks.push({ kind: "heading", content: inline(h[1]!.trim()) });
    } else if (b || n) {
      close();
      const kind = b ? "bullets" : "numbers";
      const last = blocks.at(-1);
      const item = inline((b ?? n)![1]!.trim());
      if (last && last.kind === kind) last.items.push(item);
      else blocks.push({ kind, items: [item] } as Block);
    } else {
      paragraph ??= [];
      paragraph.push(inline(line.trim()));
    }
  }
  close();
  return blocks;
}

// The first words of a description, without its marks: a job's summary on
// the careers page.
export function plain(source: string, max = 160): string {
  const text = parse(source)
    .flatMap(b => (b.kind === "heading" ? [] : b.kind === "paragraph" ? b.lines : b.items))
    .map(line => line.map(p => p.text).join(""))
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
  const chars = [...text];
  return chars.length <= max ? text : chars.slice(0, max - 1).join("").replace(/\s+\S*$/u, "") + "…";
}

// ---- The job editor (components/description-editor.tsx) --------------------
// Recruiters write in a real editor — headings look like headings, bold
// like bold, lists like lists; nobody types "##" or "**". What it holds is
// read back into the same marks as above (the stored form, and the only
// one the pages ever render), so the editor adds no HTML to the tool.

const escapeHtml = (text: string) => text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
const inlineHtml = (parts: Inline[]) => parts.map(p => (p.bold ? `<strong>${escapeHtml(p.text)}</strong>` : escapeHtml(p.text))).join("");

// toHtml: the marks as the editor's starting content (every text escaped).
export function toHtml(source: string): string {
  return parse(source).map(b => {
    if (b.kind === "heading") return `<h3>${inlineHtml(b.content)}</h3>`;
    if (b.kind === "paragraph") return `<p>${b.lines.map(inlineHtml).join("<br>")}</p>`;
    const tag = b.kind === "bullets" ? "ul" : "ol";
    return `<${tag}>${b.items.map(i => `<li>${inlineHtml(i)}</li>`).join("")}</${tag}>`;
  }).join("");
}

// A node as the editor's DOM gives it (the browser's, or a test's).
export type EditorNode = { nodeType: number; nodeName: string; textContent: string | null; childNodes: ArrayLike<EditorNode>; getAttribute?: (name: string) => string | null };

const children = (n: EditorNode): EditorNode[] => Array.from(n.childNodes as ArrayLike<EditorNode>);
const isBold = (n: EditorNode) => n.nodeName === "B" || n.nodeName === "STRONG" || /font-weight:\s*(bold|[6-9]00)/u.test(n.getAttribute?.("style") ?? "");

// The text of an element, bold kept as **…**, line breaks as "\n".
function inlineOf(n: EditorNode, bold = false): string {
  if (n.nodeType === 3) {
    const text = (n.textContent ?? "").replace(/ /gu, " ").replace(/[\r\n]+/gu, " ");
    return bold && text.trim() ? text.replace(/^(\s*)(.*?)(\s*)$/su, "$1**$2**$3") : text;
  }
  if (n.nodeType !== 1) return "";
  if (n.nodeName === "BR") return "\n";
  const inside = bold || isBold(n);
  // A bold element's text is marked once, not piece by piece.
  if (inside && !bold) {
    const text = children(n).map(c => inlineOf(c, false)).join("").replace(/\*\*/gu, "");
    return text.split("\n").map(line => (line.trim() ? line.replace(/^(\s*)(.*?)(\s*)$/su, "$1**$2**$3") : line)).join("\n");
  }
  return children(n).map(c => inlineOf(c, bold)).join("");
}

const blockNames = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "BLOCKQUOTE", "PRE"]);

// fromEditor reads the editor's content back into marks.
export function fromEditor(root: EditorNode): string {
  const blocks: string[] = [];
  let loose = "";
  const flush = () => {
    const lines = loose.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length) blocks.push(lines.join("\n"));
    loose = "";
  };
  const walk = (n: EditorNode) => {
    if (n.nodeType === 1 && blockNames.has(n.nodeName)) {
      flush();
      if (/^H[1-6]$/u.test(n.nodeName)) {
        const text = inlineOf(n).replace(/\s+/gu, " ").trim();
        if (text) blocks.push("## " + text.replace(/\*\*/gu, ""));
      } else if (n.nodeName === "UL" || n.nodeName === "OL") {
        const items = children(n).filter(c => c.nodeName === "LI").map(li => inlineOf(li).replace(/\s+/gu, " ").trim()).filter(Boolean);
        if (items.length) blocks.push(items.map((i, k) => (n.nodeName === "UL" ? "- " : `${k + 1}. `) + i).join("\n"));
      } else if (children(n).some(c => c.nodeType === 1 && blockNames.has(c.nodeName))) {
        children(n).forEach(walk);
        flush();
      } else {
        const lines = inlineOf(n).split("\n").map(l => l.trim()).filter(Boolean);
        if (lines.length) blocks.push(lines.join("\n"));
      }
      return;
    }
    loose += inlineOf(n);
  };
  children(root).forEach(walk);
  flush();
  return blocks.join("\n\n");
}
