// A small Markdown, for a card's description: headings (#, ##), lists
// (- or *, and 1.), **bold**, *italic* or _italic_, `code`, [links](https://…)
// and bare https:// addresses. Pure: it gives a tree the page renders with
// React (which escapes every text), so nothing typed becomes HTML. Links
// are http and https only.

export type Inline =
  | { type: "text"; text: string }
  | { type: "strong" | "em"; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: Inline[] };
export type Block =
  | { type: "heading"; level: 1 | 2; children: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "paragraph"; lines: Inline[][] };

const safe = (href: string): string | null => {
  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

// The inline marks, first match wins at each place.
const marks: { pattern: RegExp; make: (m: RegExpExecArray) => Inline | null }[] = [
  { pattern: /`([^`\n]+)`/uy, make: m => ({ type: "code", text: m[1]! }) },
  { pattern: /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/uy, make: m => { const href = safe(m[2]!); return href ? { type: "link", href, children: inline(m[1]!) } : null; } },
  { pattern: /\*\*(?=\S)([^\n]*?\S)\*\*/uy, make: m => ({ type: "strong", children: inline(m[1]!) }) },
  { pattern: /\*(?=[^\s*])([^*\n]*?[^\s*])\*/uy, make: m => ({ type: "em", children: inline(m[1]!) }) },
  { pattern: /(?<![\p{L}\p{N}])_(?=\S)([^_\n]*?\S)_(?![\p{L}\p{N}])/uy, make: m => ({ type: "em", children: inline(m[1]!) }) },
  { pattern: /https?:\/\/[^\s<>"']*[^\s<>"'.,;:!?)\]]/uy, make: m => { const href = safe(m[0]); return href ? { type: "link", href, children: [{ type: "text", text: m[0] }] } : null; } },
];

export function inline(text: string): Inline[] {
  const out: Inline[] = [];
  let plain = "";
  let i = 0;
  outer: while (i < text.length) {
    for (const { pattern, make } of marks) {
      pattern.lastIndex = i;
      const m = pattern.exec(text);
      if (!m) continue;
      const node = make(m);
      if (!node) continue;
      if (plain) out.push({ type: "text", text: plain });
      plain = "";
      out.push(node);
      i += m[0].length;
      continue outer;
    }
    plain += text[i];
    i++;
  }
  if (plain) out.push({ type: "text", text: plain });
  return out;
}

export function markdown(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: Inline[][] | null = null;
  let list: { ordered: boolean; items: Inline[][] } | null = null;
  const close = () => {
    if (paragraph) blocks.push({ type: "paragraph", lines: paragraph });
    if (list) blocks.push({ type: "list", ...list });
    paragraph = null;
    list = null;
  };
  for (const line of text.replace(/\r\n?/gu, "\n").split("\n")) {
    const heading = /^(#{1,3})\s+(.+)$/u.exec(line);
    const bullet = /^\s*[-*•]\s+(.+)$/u.exec(line);
    const number = /^\s*\d{1,3}[.)]\s+(.+)$/u.exec(line);
    if (line.trim() === "") close();
    else if (heading) {
      close();
      blocks.push({ type: "heading", level: heading[1]!.length === 1 ? 1 : 2, children: inline(heading[2]!.trim()) });
    } else if (bullet || number) {
      const ordered = !bullet;
      if (paragraph || (list && list.ordered !== ordered)) close();
      list ??= { ordered, items: [] };
      list.items.push(inline((bullet ?? number)![1]!.trim()));
    } else {
      if (list) close();
      paragraph ??= [];
      paragraph.push(inline(line));
    }
  }
  close();
  return blocks;
}
