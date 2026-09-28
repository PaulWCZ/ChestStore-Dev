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
