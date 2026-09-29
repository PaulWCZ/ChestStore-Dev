// Safe in the browser: no SDK here.
// The text of a post: plain text with a few marks people already type in
// emails and chats — never HTML. It is read into a small tree (paragraphs,
// subheadings, lists, quotes; bold, italic, links) that the page renders as
// React elements: nothing written by a person ever reaches the page as
// markup, so there is nothing to sanitise and nothing to inject.
//
//   ## A subheading
//   **bold**, *italic* or _italic_, [a link](https://…), https://bare.link
//   - a list item          1. a numbered item          > a quote
//   ![words](image:12)     a picture of the post, alone on its line
//
// A blank line starts a new paragraph; a single line break is kept.

export type Inline =
  | { t: "text"; v: string }
  | { t: "b"; c: Inline[] }
  | { t: "i"; c: Inline[] }
  | { t: "a"; href: string; c: Inline[] }
  | { t: "br" };

export type Block =
  | { t: "p"; c: Inline[] }
  | { t: "h"; c: Inline[] }
  | { t: "quote"; c: Inline[] }
  | { t: "ul"; items: Inline[][] }
  | { t: "ol"; start: number; items: Inline[][] }
  | { t: "img"; id: string; alt: string };

const bullet = /^\s{0,3}[-*•]\s+(.*)$/u;
const numbered = /^\s{0,3}(\d{1,6})[.)]\s+(.*)$/u;
const heading = /^\s{0,3}#{1,3}\s+(.*)$/u;
const quote = /^\s{0,3}>\s?(.*)$/u;
const picture = /^\s{0,3}!\[([^\]\n]{0,200})\]\(image:([1-9][0-9]{0,17})\)\s*$/u;

// A link goes to the web or to an address; nothing else is ever a link
// (no javascript:, data:, relative paths).
const safeHref = /^(https?:\/\/[^\s<>"'`]+|mailto:[^\s<>"'`@]+@[^\s<>"'`]+)$/iu;
export function isSafeHref(href: string): boolean {
  return safeHref.test(href) && href.length <= 2000;
}

export function parse(text: string): Block[] {
  const lines = text.replace(/\r\n?/gu, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let quoted: string[] = [];
  let list: { t: "ul" | "ol"; start: number; items: string[] } | null = null;
  const flush = () => {
    if (paragraph.length) blocks.push({ t: "p", c: lineBreaks(paragraph) });
    if (quoted.length) blocks.push({ t: "quote", c: lineBreaks(quoted) });
    if (list) blocks.push(list.t === "ul" ? { t: "ul", items: list.items.map(i => inline(i)) } : { t: "ol", start: list.start, items: list.items.map(i => inline(i)) });
    paragraph = [];
    quoted = [];
    list = null;
  };
  for (const line of lines) {
    if (line.trim() === "") {
      flush();
      continue;
    }
    let m: RegExpExecArray | null;
    if ((m = picture.exec(line))) {
      flush();
      blocks.push({ t: "img", id: m[2]!, alt: m[1]!.replace(/\\(.)/gu, "$1").trim() });
    } else if ((m = heading.exec(line))) {
      flush();
      blocks.push({ t: "h", c: inline(m[1]!.trim()) });
    } else if ((m = bullet.exec(line))) {
      if (list?.t !== "ul") flush();
      list ??= { t: "ul", start: 1, items: [] };
      list.items.push(m[1]!.trim());
    } else if ((m = numbered.exec(line))) {
      if (list?.t !== "ol") flush();
      list ??= { t: "ol", start: Number(m[1]), items: [] };
      list.items.push(m[2]!.trim());
    } else if ((m = quote.exec(line))) {
      if (quoted.length === 0) flush();
      quoted.push(m[1]!);
    } else if (list && /^\s{2,}\S/u.test(line)) {
      // A list item that goes on over the next line.
      list.items[list.items.length - 1] += " " + line.trim();
    } else {
      if (paragraph.length === 0) flush();
      paragraph.push(line.trim());
    }
  }
  flush();
  return blocks;
}

function lineBreaks(lines: string[]): Inline[] {
  return lines.flatMap((line, i) => (i === 0 ? inline(line) : [{ t: "br" } as Inline, ...inline(line)]));
}

const word = /[\p{L}\p{N}]/u;
// How far a closing mark is looked for: a stray star costs little.
const reach = 2000;

// inline reads the marks of one line (or item). depth bounds the nesting.
export function inline(text: string, depth = 0): Inline[] {
  const out: Inline[] = [];
  let plain = "";
  const push = (node: Inline) => {
    if (plain) out.push({ t: "text", v: plain });
    plain = "";
    out.push(node);
  };
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    const rest = text.slice(i);
    // An escaped mark is itself.
    if (c === "\\" && i + 1 < text.length && /[\\*_[\]()#>.!•-]/u.test(text[i + 1]!)) {
      plain += text[i + 1];
      i += 2;
      continue;
    }
    if (depth < 4 && rest.startsWith("**")) {
      const end = text.indexOf("**", i + 2);
      if (end > i + 2 && end - i < reach && !/\s/u.test(text[i + 2]!) && !/\s/u.test(text[end - 1]!)) {
        push({ t: "b", c: inline(text.slice(i + 2, end), depth + 1) });
        i = end + 2;
        continue;
      }
    }
    if (depth < 4 && (c === "*" || c === "_") && text[i + 1] !== c) {
      const before = i === 0 ? "" : text[i - 1]!;
      const opens = text[i + 1] !== undefined && !/\s/u.test(text[i + 1]!) && (c === "*" || !word.test(before));
      if (opens) {
        let end = -1;
        for (let j = i + 1; j < text.length && j - i < reach; j++) {
          if (text[j] === "\\") { j++; continue; }
          if (text[j] === c && text[j + 1] !== c && text[j - 1] !== c && !/\s/u.test(text[j - 1]!) && (c === "*" || !word.test(text[j + 1] ?? ""))) {
            end = j;
            break;
          }
        }
        if (end > i + 1) {
          push({ t: "i", c: inline(text.slice(i + 1, end), depth + 1) });
          i = end + 1;
          continue;
        }
      }
    }
    if (c === "[") {
      const close = text.indexOf("](", i + 1);
      const end = close < 0 ? -1 : text.indexOf(")", close + 2);
      if (close > i + 1 && end > close + 2 && end - i < reach) {
        const label = text.slice(i + 1, close);
        const href = text.slice(close + 2, end).trim();
        if (!label.includes("[") && isSafeHref(href)) {
          push({ t: "a", href, c: inline(label, depth + 1).filter(n => n.t !== "a") });
          i = end + 1;
          continue;
        }
      }
    }
    if ((c === "h" || c === "H") && (i === 0 || !word.test(text[i - 1]!))) {
      const m = /^https?:\/\/[^\s<>"'`]+/iu.exec(rest);
      if (m) {
        // Punctuation that ends a sentence is not part of the link.
        let href = m[0];
        while (/[.,;:!?'"]$/u.test(href) || (href.endsWith(")") && !href.includes("("))) href = href.slice(0, -1);
        if (href.length > "https://".length && isSafeHref(href)) {
          push({ t: "a", href, c: [{ t: "text", v: href }] });
          i += href.length;
          continue;
        }
      }
    }
    plain += c;
    i++;
  }
  if (plain) out.push({ t: "text", v: plain });
  return out;
}

// plain is the text of a post without its marks: excerpts, the bell, the
// calendar file.
export function plainInline(nodes: Inline[]): string {
  return nodes.map(n => (n.t === "text" ? n.v : n.t === "br" ? "\n" : plainInline(n.c))).join("");
}

export function plain(text: string): string {
  return parse(text)
    .filter(b => b.t !== "img")
    .map(b => (b.t === "ul" ? b.items.map(i => "• " + plainInline(i)).join("\n") : b.t === "ol" ? b.items.map((item, k) => `${b.start + k}. ${plainInline(item)}`).join("\n") : plainInline(b.c)))
    .join("\n\n");
}

// excerpt is the start of a post's text on one line, cut at a word.
export function excerpt(text: string, max: number): string {
  // The paragraphs tell the story; lists and subheadings only when there is
  // nothing else.
  const blocks = parse(text);
  const told = blocks.filter(b => b.t === "p" || b.t === "quote").map(b => plainInline((b as { c: Inline[] }).c)).join(" ");
  const flat = (told || plain(text)).replace(/\s+/gu, " ").trim();
  const chars = [...flat];
  if (chars.length <= max) return flat;
  const cut = chars.slice(0, max).join("");
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s.,;:!?-]+$/u, "") + "…";
}
