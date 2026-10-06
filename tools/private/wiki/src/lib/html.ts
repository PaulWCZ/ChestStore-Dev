import { parseDocument } from "htmlparser2";
import type { Doc, DocNode, Mark } from "./doc.ts";

// HTML in: the pages of a Confluence space export ("Export space → HTML"),
// a Google Docs "Web page (.html, zipped)" download, or any saved web page,
// become page documents. Only what the wiki's schema holds is kept — text,
// headings, lists, checklists, tables, quotes, code, note boxes, links and
// images; scripts, styles, forms and layout are dropped. Like
// fromMarkdown(), the document is NOT normalized yet: its links and images
// still point to the files of the export; the importer rewrites them, then
// lib/doc.ts normalize() keeps what is safe.
//
// Confluence's own markup (as its HTML export writes it) is read for what
// it means: information/tip/note/warning macros and panels become note
// boxes, code macros code blocks, inline task lists checklists, links to
// other pages by the page's id, emoticons their text.

type El = { type: string; name: string; attribs: Record<string, string>; children: Nd[]; parent: El | null };
type Tx = { type: "text"; data: string; parent: El | null };
type Nd = El | Tx | { type: string; parent: El | null; children?: Nd[] };

const isEl = (n: Nd | null | undefined): n is El => !!n && (n.type === "tag" || n.type === "script" || n.type === "style");
const isText = (n: Nd): n is Tx => n.type === "text";
// The document itself (the root above <html>) has no attributes.
const classes = (e: El): string[] => (e.attribs?.["class"] ?? "").split(/\s+/u).filter(Boolean);
const hasClass = (e: El, c: string) => classes(e).includes(c);

export function parseHtml(source: string): El {
  return parseDocument(source, { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true }) as unknown as El;
}

// Finding elements (no CSS engine: a few plain tests).
export function find(root: El, test: (e: El) => boolean): El | null {
  for (const c of root.children ?? []) {
    if (!isEl(c)) continue;
    if (test(c)) return c;
    const deeper = find(c, test);
    if (deeper) return deeper;
  }
  return null;
}
export function findAll(root: El, test: (e: El) => boolean, out: El[] = []): El[] {
  for (const c of root.children ?? []) {
    if (!isEl(c)) continue;
    if (test(c)) out.push(c);
    findAll(c, test, out);
  }
  return out;
}
export const byId = (root: El, id: string) => find(root, e => e.attribs["id"] === id);
export function textOf(n: Nd): string {
  if (isText(n)) return n.data;
  if (isEl(n) && (n.name === "script" || n.name === "style")) return "";
  return ((n as El).children ?? []).map(textOf).join("");
}
const squash = (s: string) => s.replace(/\s+/gu, " ").trim();

// Google Docs writes bold and italics as classes (".c3{font-weight:700}")
// in the page's <style>: the classes that mean a mark, by name.
export function classMarks(root: El): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const style of findAll(root, e => e.name === "style")) {
    const css = style.children.map(c => (isText(c) ? c.data : "")).join("");
    for (const rule of css.matchAll(/\.([A-Za-z0-9_-]+)\s*\{([^}]*)\}/gu)) {
      const marks = stylesToMarks(rule[2]!);
      if (marks.length > 0) out.set(rule[1]!, marks);
    }
  }
  return out;
}
function stylesToMarks(style: string): string[] {
  const s = style.toLowerCase().replace(/\s+/gu, "");
  const marks: string[] = [];
  if (/font-weight:(bold|[6-9]00)/u.test(s)) marks.push("bold");
  if (/font-style:italic/u.test(s)) marks.push("italic");
  if (/text-decoration(-line)?:[^;]*line-through/u.test(s)) marks.push("strike");
  return marks;
}

export type HtmlOptions = {
  // Class names that mean marks (Google Docs).
  classes?: Map<string, string[]>;
  // The file of another exported page, by Confluence's page id.
  pageFile?: (pageId: string) => string | null;
};

// Google wraps every link of an exported document in a redirect.
function unwrap(href: string): string {
  const m = /^https?:\/\/(?:www\.)?google\.[a-z.]+\/url\?(.*)$/iu.exec(href);
  if (!m) return href;
  try {
    return new URLSearchParams(m[1]).get("q") ?? href;
  } catch {
    return href;
  }
}

const skipped = new Set(["script", "style", "head", "title", "meta", "link", "noscript", "iframe", "object", "embed", "form", "input", "button", "select", "textarea", "svg", "canvas", "video", "audio", "template", "nav"]);
const calloutTone: Record<string, string> = { information: "info", note: "warning", tip: "tip", warning: "warning" };

// htmlToDoc turns the children of an element (a page's body or content)
// into a document.
export function htmlToDoc(root: El, options: HtmlOptions = {}): Doc {
  const content = blocks(root.children ?? [], options);
  return { type: "doc", content: content.length > 0 ? content : [{ type: "paragraph" }] };
}

// Blocks, from nodes where blocks are expected; loose text and inline
// elements between blocks make paragraphs.
function blocks(nodes: Nd[], o: HtmlOptions): DocNode[] {
  const out: DocNode[] = [];
  let run: DocNode[] = [];
  const flush = () => {
    out.push(...paragraphs(run));
    run = [];
  };
  for (const n of nodes) {
    if (isText(n)) {
      run.push(...inline(n, [], o));
      continue;
    }
    if (!isEl(n) || skipped.has(n.name)) continue;
    const made = block(n, o);
    if (made === null) run.push(...inline(n, [], o));
    else {
      flush();
      out.push(...made);
    }
  }
  flush();
  return out;
}

const inlineNames = new Set(["a", "span", "b", "strong", "i", "em", "u", "s", "del", "strike", "code", "tt", "kbd", "sub", "sup", "small", "big", "font", "mark", "abbr", "cite", "q", "time", "label", "br", "img", "wbr"]);

// A block element as blocks, or null when it is inline.
function block(e: El, o: HtmlOptions): DocNode[] | null {
  const cls = classes(e);
  // Confluence's macros first.
  const macro = cls.find(c => c.startsWith("confluence-information-macro-") && c.slice(29) in calloutTone);
  if (macro) {
    const title = find(e, x => hasClass(x, "title"));
    const body = find(e, x => hasClass(x, "confluence-information-macro-body")) ?? e;
    const inner = blocks(body.children, o);
    if (title && squash(textOf(title))) inner.unshift({ type: "paragraph", content: [{ type: "text", text: squash(textOf(title)), marks: [{ type: "bold" }] }] });
    return [{ type: "callout", attrs: { tone: calloutTone[macro.slice(29)] }, content: inner }];
  }
  if (e.name === "div" && cls.includes("code") && cls.includes("panel")) {
    const pre = find(e, x => x.name === "pre");
    return pre ? codeBlock(pre) : [];
  }
  if (e.name === "div" && cls.includes("panel")) {
    const header = find(e, x => hasClass(x, "panelHeader"));
    const body = find(e, x => hasClass(x, "panelContent")) ?? e;
    const inner = blocks(body.children, o);
    if (header && squash(textOf(header))) inner.unshift({ type: "paragraph", content: [{ type: "text", text: squash(textOf(header)), marks: [{ type: "bold" }] }] });
    return [{ type: "callout", attrs: { tone: "info" }, content: inner }];
  }
  if (cls.includes("expand-container")) {
    const control = find(e, x => hasClass(x, "expand-control-text"));
    const body = find(e, x => hasClass(x, "expand-content"));
    const inner = body ? blocks(body.children, o) : [];
    if (control && squash(textOf(control))) inner.unshift({ type: "paragraph", content: [{ type: "text", text: squash(textOf(control)), marks: [{ type: "bold" }] }] });
    return inner;
  }
  // Confluence's own furniture: a table of contents, page properties, attachments lists.
  if (cls.includes("toc-macro") || cls.includes("client-side-toc-macro") || cls.includes("plugin_attachments_container")) return [];
  switch (e.name) {
    case "p":
      // Google Docs' title and subtitle are paragraphs.
      if (cls.includes("title")) return [{ type: "heading", attrs: { level: 1 }, content: inline(e, [], o).filter(n => n.type !== "image") }];
      return paragraphs(inline(e, [], o), true);
    case "h1": case "h2": case "h3": case "h4": case "h5": case "h6": {
      const level = Math.min(Number(e.name[1]), 3);
      const content = inline(e, [], o);
      const images = content.filter(n => n.type === "image");
      const text = content.filter(n => n.type !== "image");
      return [...(text.some(n => (n.text ?? "").trim()) ? [{ type: "heading", attrs: { level }, content: trimEdges(text) }] : []), ...images];
    }
    case "ul":
    case "ol": {
      const items = e.children.filter((c): c is El => isEl(c) && c.name === "li");
      if (cls.includes("inline-task-list") || (e.attribs["data-inline-tasks-content-id"] ?? "") !== "") {
        return [{ type: "taskList", content: items.map(li => ({ type: "taskItem", attrs: { checked: hasClass(li, "checked") }, content: blocks(li.children, o) })) }];
      }
      const list = items.map(li => ({ type: "listItem", content: blocks(li.children, o) }));
      if (e.name === "ol") {
        const start = Number(e.attribs["start"] ?? 1);
        return [{ type: "orderedList", attrs: { start: Number.isInteger(start) ? start : 1 }, content: list }];
      }
      return [{ type: "bulletList", content: list }];
    }
    case "li":
      return [{ type: "bulletList", content: [{ type: "listItem", content: blocks(e.children, o) }] }];
    case "blockquote":
      return [{ type: "blockquote", content: blocks(e.children, o) }];
    case "pre":
      return codeBlock(e);
    case "hr":
      return [{ type: "horizontalRule" }];
    case "table":
      return [table(e, o)];
    case "dl":
      return blocks(e.children, o);
    case "dt":
      return [{ type: "paragraph", content: inline(e, [{ type: "bold" }], o) }];
    case "img":
    case "br":
      return null;
    default:
      if (inlineNames.has(e.name)) {
        // An inline element that holds blocks (a <span> around a table…) is a block.
        return findAll(e, x => !inlineNames.has(x.name) && !skipped.has(x.name)).length > 0 ? blocks(e.children, o) : null;
      }
      // div, section, article, main, header, footer, figure, center…: what they hold.
      return blocks(e.children, o);
  }
}

function codeBlock(pre: El): DocNode[] {
  const text = textOf(pre).replace(/^\n/u, "").replace(/\n$/u, "");
  const brush = /brush:\s*([a-z0-9+#-]+)/iu.exec(pre.attribs["data-syntaxhighlighter-params"] ?? "")?.[1] ?? /language-([a-z0-9+#-]+)/iu.exec(pre.attribs["class"] ?? "")?.[1];
  return [{ type: "codeBlock", ...(brush ? { attrs: { language: brush } } : {}), ...(text ? { content: [{ type: "text", text }] } : {}) }];
}

function table(e: El, o: HtmlOptions): DocNode {
  const rows: DocNode[] = [];
  const walk = (x: El) => {
    for (const c of x.children) {
      if (!isEl(c)) continue;
      if (c.name === "tr") {
        const cells = c.children.filter((d): d is El => isEl(d) && (d.name === "td" || d.name === "th")).map(d => {
          const colspan = Number(d.attribs["colspan"] ?? 1);
          const rowspan = Number(d.attribs["rowspan"] ?? 1);
          const inner = blocks(d.children, o);
          return { type: d.name === "th" ? "tableHeader" : "tableCell", ...(colspan > 1 || rowspan > 1 ? { attrs: { colspan, rowspan } } : {}), content: inner.length > 0 ? inner : [{ type: "paragraph" }] };
        });
        if (cells.length > 0) rows.push({ type: "tableRow", content: cells });
      } else if (c.name === "thead" || c.name === "tbody" || c.name === "tfoot") walk(c);
    }
  };
  walk(e);
  return { type: "table", content: rows };
}

// Inline content of a node, with the marks around it. Images come out as
// they are (blocks here): paragraphs() splits around them.
function inline(n: Nd, marks: Mark[], o: HtmlOptions): DocNode[] {
  if (isText(n)) {
    const text = n.data.replace(/\s+/gu, " ");
    if (text === "") return [];
    return [marks.length > 0 ? { type: "text", text, marks: marks.map(m => ({ ...m })) } : { type: "text", text }];
  }
  if (!isEl(n) || skipped.has(n.name)) return [];
  const e = n;
  if (e.name === "br") return [{ type: "hardBreak" }];
  if (e.name === "img") {
    const alt = e.attribs["alt"] ?? "";
    const src = e.attribs["data-image-src"] ?? e.attribs["src"] ?? "";
    // Confluence's emoticons and icons are words, not pictures of the page.
    if (hasClass(e, "emoticon") || /(^|\/)images\/icons\//u.test(src)) return alt ? [{ type: "text", text: alt, ...(marks.length ? { marks } : {}) }] : [];
    if (!src || src.startsWith("data:")) return [];
    return [{ type: "image", attrs: { src, alt: e.attribs["data-linked-resource-default-alias"] ?? alt, title: e.attribs["title"] ?? "" } }];
  }
  const more: Mark[] = [];
  const add = (type: string) => { if (!marks.some(m => m.type === type) && !more.some(m => m.type === type)) more.push({ type }); };
  switch (e.name) {
    case "b": case "strong": add("bold"); break;
    case "i": case "em": case "cite": add("italic"); break;
    case "u": add("underline"); break;
    case "s": case "del": case "strike": add("strike"); break;
    case "code": case "tt": case "kbd": add("code"); break;
    case "a": {
      let href = unwrap(e.attribs["href"] ?? "");
      // A link to another page of the space, by its id (Confluence).
      const pageId = e.attribs["data-linked-resource-type"] === "page" ? e.attribs["data-linked-resource-id"] : undefined;
      const local = pageId && o.pageFile ? o.pageFile(pageId) : null;
      if (local) href = local;
      // A mention of a person: their name, not a link to Confluence.
      if (e.attribs["data-linked-resource-type"] === "userinfo" || hasClass(e, "confluence-userlink")) href = "";
      if (href && !marks.some(m => m.type === "link")) more.push({ type: "link", attrs: { href } });
      break;
    }
  }
  for (const m of stylesToMarks(e.attribs["style"] ?? "")) add(m);
  for (const c of classes(e)) for (const m of o.classes?.get(c) ?? []) add(m);
  const inner = [...marks, ...more];
  return e.children.flatMap(c => inline(c, inner, o));
}

// Inline content as paragraphs, split around images; empty lines dropped.
function paragraphs(content: DocNode[], keepEmpty = false): DocNode[] {
  const out: DocNode[] = [];
  let run: DocNode[] = [];
  const flush = () => {
    const kept = trimEdges(run);
    if (kept.some(n => n.type !== "hardBreak")) out.push({ type: "paragraph", content: kept });
    run = [];
  };
  for (const n of content) {
    if (n.type === "image") {
      flush();
      out.push(n);
    } else run.push(n);
  }
  flush();
  return out.length > 0 || !keepEmpty ? out : [];
}

// Spaces and line breaks at the start and end of a paragraph go.
function trimEdges(nodes: DocNode[]): DocNode[] {
  const list = nodes.map(n => ({ ...n }));
  while (list[0] && (list[0].type === "hardBreak" || (list[0].type === "text" && (list[0].text ?? "").trim() === ""))) list.shift();
  while (list.at(-1) && (list.at(-1)!.type === "hardBreak" || (list.at(-1)!.type === "text" && (list.at(-1)!.text ?? "").trim() === ""))) list.pop();
  if (list[0]?.type === "text") list[0].text = (list[0].text ?? "").trimStart();
  const last = list.at(-1);
  if (last?.type === "text") last.text = (last.text ?? "").trimEnd();
  return list;
}

// A Confluence page of a space export: its title (without the space's
// name before it), its content, the page above it by the breadcrumbs, and
// its attachments (file, name).
export type ConfluencePage = { title: string; content: El; crumbs: string[]; attachments: { href: string; name: string }[]; updated: Date | null };

// The date a Confluence page was last changed, as its export writes it
// under the title ("Created by Camille Martin, last modified on Sep 02,
// 2026" — or in French, "modifié le 02 sept. 2026", or 2026-09-02): the
// last date of that line. Null when there is none, or it is in the future.
const monthNames: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  janv: 1, fevr: 2, fev: 2, mars: 3, avr: 4, mai: 5, juin: 6, juil: 7, aout: 8, dece: 12,
};
export function confluenceDate(line: string, now = new Date()): Date | null {
  const text = line.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();
  const found: Date[] = [];
  const at = (y: number, m: number, d: number) => {
    const date = new Date(Date.UTC(y, m - 1, d, 12));
    if (y >= 1990 && date.getUTCMonth() === m - 1 && date.getUTCDate() === d) found.push(date);
  };
  for (const x of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/gu)) at(Number(x[1]), Number(x[2]), Number(x[3]));
  for (const x of text.matchAll(/\b([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/gu)) {
    const m = monthNames[x[1]!.slice(0, 4)] ?? monthNames[x[1]!.slice(0, 3)];
    if (m) at(Number(x[3]), m, Number(x[2]));
  }
  for (const x of text.matchAll(/\b(\d{1,2})\s+([a-z]{3,9})\.?\s+(\d{4})\b/gu)) {
    const m = monthNames[x[2]!.slice(0, 4)] ?? monthNames[x[2]!.slice(0, 3)];
    if (m) at(Number(x[3]), m, Number(x[1]));
  }
  const kept = found.filter(d => d.getTime() <= now.getTime());
  return kept.length > 0 ? kept.sort((a, b) => a.getTime() - b.getTime()).at(-1)! : null;
}

export function confluencePage(root: El): ConfluencePage | null {
  const content = byId(root, "main-content");
  if (!content) return null;
  const heading = byId(root, "title-text") ?? find(root, e => e.name === "title");
  let title = squash(heading ? textOf(heading) : "");
  const colon = title.indexOf(" : ");
  if (colon >= 0) title = title.slice(colon + 3).trim();
  const crumbs = findAll(byId(root, "breadcrumbs") ?? ({ children: [] } as unknown as El), e => e.name === "a").map(a => a.attribs["href"] ?? "").filter(Boolean);
  const attachments: { href: string; name: string }[] = [];
  const section = byId(root, "attachments");
  let box: El | null = section;
  while (box && !hasClass(box, "pageSection")) box = box.parent;
  if (box) for (const a of findAll(box, e => e.name === "a")) {
    const href = a.attribs["href"] ?? "";
    if (/(^|\/)attachments\//u.test(href)) attachments.push({ href, name: squash(textOf(a)) || href.split("/").at(-1)! });
  }
  const meta = find(root, e => hasClass(e, "page-metadata"));
  return { title, content, crumbs, attachments, updated: meta ? confluenceDate(squash(textOf(meta))) : null };
}

// The page tree of a Confluence export's index.html ("Available Pages"):
// each page file with the file of the page above it, in the space's order.
// Confluence writes each child in a list of its own, so an item's parent is
// the nearest item around it.
export function confluenceTree(root: El): { file: string; parent: string | null }[] | null {
  const heading = byId(root, "pagetree") ?? find(root, e => /^h[1-6]$/u.test(e.name) && /available pages/iu.test(textOf(e)));
  if (!heading) return null;
  // Up to the section around the tree — never above an element (a
  // malformed index has none: the heading's parent is the scope then).
  let section: El | null = heading;
  while (section && isEl(section) && !hasClass(section, "pageSection")) section = section.parent;
  const scope = section && isEl(section) ? section : heading.parent;
  if (!scope) return null;
  const out: { file: string; parent: string | null }[] = [];
  // An item's own link: not one of the items inside it.
  const linkOf = (li: El): string | null => {
    for (const c of li.children) {
      if (!isEl(c) || c.name === "ul" || c.name === "ol") continue;
      const a = c.name === "a" ? c : find(c, e => e.name === "a");
      if (a?.attribs["href"]) return a.attribs["href"];
    }
    return null;
  };
  for (const li of findAll(scope, e => e.name === "li")) {
    const file = linkOf(li);
    if (!file) continue;
    let up: El | null = li.parent;
    while (up && up.name !== "li") up = up.parent;
    out.push({ file, parent: up && up !== scope ? linkOf(up) : null });
  }
  return out;
}
