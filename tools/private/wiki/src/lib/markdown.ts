import MarkdownIt from "markdown-it";
import type { Doc, DocNode, Mark } from "./doc.ts";

// Markdown in and out: imports (a .md file, a Notion export) become page
// documents; exports write pages as Markdown. Raw HTML in a Markdown file is
// never kept (html: false: it stays visible as text).
//
// fromMarkdown answers a document that is NOT normalized yet: its links and
// images still point to what the file named (other files of an export);
// the importer rewrites them, then lib/doc.ts normalize() keeps what is safe.

const parser = new MarkdownIt({ html: false, linkify: true, typographer: false });
type Token = ReturnType<typeof parser.parse>[number];

// Notion writes callouts as <aside> blocks; GitHub as "> [!NOTE]". Both
// become callouts: the asides are turned into alerts before parsing.
function asides(text: string): string {
  const out: string[] = [];
  let inside = false;
  let first = false;
  for (const line of text.split("\n")) {
    if (/^\s*<aside>\s*$/iu.test(line)) {
      inside = true;
      first = true;
      out.push("> [!NOTE]");
      continue;
    }
    if (inside && /^\s*<\/aside>\s*$/iu.test(line)) {
      inside = false;
      out.push("");
      continue;
    }
    if (inside) {
      out.push("> " + (first ? line.replace(/^\s*\p{Extended_Pictographic}️?\s*/u, "") : line));
      if (line.trim() !== "") first = false;
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

const alertTone: Record<string, string> = { NOTE: "info", IMPORTANT: "info", TIP: "tip", WARNING: "warning", CAUTION: "warning" };

function inlineNodes(tokens: Token[]): DocNode[] {
  const out: DocNode[] = [];
  const marks: Mark[] = [];
  const push = (text: string, extra: Mark[] = []) => {
    if (text === "") return;
    const all = [...marks, ...extra];
    out.push(all.length > 0 ? { type: "text", text, marks: all.map(m => ({ ...m })) } : { type: "text", text });
  };
  const open = (type: string, attrs?: Record<string, unknown>) => marks.push(attrs ? { type, attrs } : { type });
  const close = (type: string) => {
    const i = marks.map(m => m.type).lastIndexOf(type);
    if (i >= 0) marks.splice(i, 1);
  };
  for (const t of tokens) {
    switch (t.type) {
      case "text": push(t.content); break;
      case "code_inline": push(t.content, [{ type: "code" }]); break;
      case "softbreak": push(" "); break;
      case "hardbreak": out.push({ type: "hardBreak" }); break;
      case "strong_open": open("bold"); break;
      case "strong_close": close("bold"); break;
      case "em_open": open("italic"); break;
      case "em_close": close("italic"); break;
      case "s_open": open("strike"); break;
      case "s_close": close("strike"); break;
      case "link_open": open("link", { href: t.attrGet("href") ?? "" }); break;
      case "link_close": close("link"); break;
      case "image":
        // Images are blocks here: the paragraph is split around them.
        out.push({ type: "image", attrs: { src: t.attrGet("src") ?? "", alt: t.children?.map(c => c.content).join("") ?? t.content, title: t.attrGet("title") ?? "" } });
        break;
      default:
        if (t.content) push(t.content);
    }
  }
  return out;
}

// A paragraph with images in it: text, image, text…
function paragraphs(content: DocNode[]): DocNode[] {
  const out: DocNode[] = [];
  let run: DocNode[] = [];
  const flush = () => {
    while (run[0]?.type === "hardBreak") run.shift();
    if (run.some(n => n.type !== "hardBreak" && (n.type !== "text" || (n.text ?? "").trim() !== ""))) out.push({ type: "paragraph", content: run });
    run = [];
  };
  for (const n of content) {
    if (n.type === "image") {
      flush();
      out.push(n);
    } else run.push(n);
  }
  flush();
  return out.length > 0 ? out : [{ type: "paragraph" }];
}

export function fromMarkdown(source: string): Doc {
  const tokens = parser.parse(asides(source.replace(/\r\n?/gu, "\n").replace(/^﻿/u, "")), {});
  let i = 0;
  // blocks reads tokens until the closing token `until`.
  const blocks = (until: string | null): DocNode[] => {
    const out: DocNode[] = [];
    while (i < tokens.length) {
      const t = tokens[i]!;
      if (until !== null && t.type === until) {
        i++;
        return out;
      }
      i++;
      switch (t.type) {
        case "paragraph_open": {
          const inl = tokens[i]?.type === "inline" ? inlineNodes(tokens[i++]!.children ?? []) : [];
          i++; // paragraph_close
          out.push(...paragraphs(inl));
          break;
        }
        case "heading_open": {
          const level = Number(t.tag.slice(1));
          const inl = tokens[i]?.type === "inline" ? inlineNodes(tokens[i++]!.children ?? []) : [];
          i++;
          out.push({ type: "heading", attrs: { level }, content: inl.filter(n => n.type !== "image") });
          break;
        }
        case "blockquote_open": {
          const content = blocks("blockquote_close");
          const first = content[0];
          const lead = first?.type === "paragraph" ? first.content?.[0] : undefined;
          const alert = lead?.type === "text" ? /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/u.exec(lead.text ?? "") : null;
          if (alert && lead) {
            lead.text = (lead.text ?? "").slice(alert[0].length);
            // What followed the marker on its line, or the next lines.
            const rest = first!.content!;
            while (rest[0] && (rest[0].type === "hardBreak" || (rest[0].type === "text" && (rest[0].text ?? "").trim() === ""))) rest.shift();
            if (rest[0]?.type === "text") rest[0].text = (rest[0].text ?? "").trimStart();
            if ((first!.content ?? []).length === 0) content.shift();
            out.push({ type: "callout", attrs: { tone: alertTone[alert[1]!] ?? "info" }, content });
          } else out.push({ type: "blockquote", content });
          break;
        }
        case "bullet_list_open":
        case "ordered_list_open": {
          const ordered = t.type === "ordered_list_open";
          const items: DocNode[] = [];
          while (i < tokens.length && tokens[i]!.type === "list_item_open") {
            i++;
            items.push({ type: "listItem", content: blocks("list_item_close") });
          }
          i++; // list close
          // "- [ ] thing" and "- [x] thing" make a checklist.
          const box = /^\[( |x|X)\]\s+/u;
          const isTask = (item: DocNode) => {
            const lead = item.content?.[0]?.content?.[0];
            return item.content?.[0]?.type === "paragraph" && lead?.type === "text" && box.test(lead.text ?? "");
          };
          if (!ordered && items.length > 0 && items.every(isTask)) {
            out.push({
              type: "taskList",
              content: items.map(item => {
                const lead = item.content![0]!.content![0]!;
                const checked = /^\[(x|X)\]/u.test(lead.text ?? "");
                lead.text = (lead.text ?? "").replace(box, "");
                return { type: "taskItem", attrs: { checked }, content: item.content ?? [] };
              }),
            });
          } else {
            const start = Number(t.attrGet("start") ?? 1);
            out.push(ordered ? { type: "orderedList", attrs: { start: Number.isFinite(start) ? start : 1 }, content: items } : { type: "bulletList", content: items });
          }
          break;
        }
        case "fence":
        case "code_block": {
          const text = t.content.replace(/\n$/u, "");
          const language = t.info.trim().split(/\s+/u)[0] ?? "";
          out.push({ type: "codeBlock", ...(language ? { attrs: { language } } : {}), ...(text ? { content: [{ type: "text", text }] } : {}) });
          break;
        }
        case "hr":
          out.push({ type: "horizontalRule" });
          break;
        case "table_open": {
          const rows: DocNode[] = [];
          while (i < tokens.length && tokens[i]!.type !== "table_close") {
            const r = tokens[i]!;
            i++;
            if (r.type !== "tr_open") continue;
            const cells: DocNode[] = [];
            while (i < tokens.length && tokens[i]!.type !== "tr_close") {
              const c = tokens[i]!;
              i++;
              if (c.type !== "th_open" && c.type !== "td_open") continue;
              const inl = tokens[i]?.type === "inline" ? inlineNodes(tokens[i++]!.children ?? []) : [];
              i++; // cell close
              cells.push({ type: c.type === "th_open" ? "tableHeader" : "tableCell", content: paragraphs(inl) });
            }
            i++; // tr_close
            rows.push({ type: "tableRow", content: cells });
          }
          i++; // table_close
          out.push({ type: "table", content: rows });
          break;
        }
        case "inline":
          out.push(...paragraphs(inlineNodes(t.children ?? [])));
          break;
        default:
          break;
      }
    }
    return out;
  };
  const content = blocks(null);
  // Headings: a first "# Title" stays level 1 (takeTitle takes it). A page
  // whose sections are "#" keeps its levels; one whose sections start at
  // "##" (a title above them, as our exports write) moves them up one.
  const all: DocNode[] = [];
  const walk = (nodes: DocNode[]) => nodes.forEach(n => (n.type === "heading" ? all.push(n) : walk(n.content ?? [])));
  walk(content);
  const lead = content[0]?.type === "heading" && content[0].attrs?.["level"] === 1 ? content[0] : null;
  const shift = all.some(h => h !== lead && h.attrs?.["level"] === 1) ? 0 : 1;
  for (const h of all) if (h !== lead) h.attrs = { level: Math.min(Math.max(Number(h.attrs?.["level"]) - shift, 1), 3) };
  return { type: "doc", content: content.length > 0 ? content : [{ type: "paragraph" }] };
}

// firstHeading takes a title written as the file's first "# heading" (as
// Notion does) out of the document.
export function takeTitle(doc: Doc): { title: string | null; doc: Doc } {
  const first = doc.content[0];
  if (first?.type !== "heading" || Number(first.attrs?.["level"]) !== 1) return { title: null, doc };
  const title = (first.content ?? []).map(n => n.text ?? "").join("").trim();
  const rest = doc.content.slice(1);
  return { title: title || null, doc: { type: "doc", content: rest.length > 0 ? rest : [{ type: "paragraph" }] } };
}

// Markdown out.
export type MarkdownOptions = {
  title: (pageId: string) => string | undefined;
  pageHref: (pageId: string, anchor: string) => string;
  fileHref: (fileId: string) => string;
  missing: string;
};

const escapeText = (text: string): string => text.replace(/([\\`*_[\]<>|])/gu, "\\$1");
const escapeUrl = (url: string): string => url.replace(/[ ()<>]/gu, c => encodeURIComponent(c));

function mdLink(href: string, o: MarkdownOptions): string {
  const page = /^\/chest\/pages\/([0-9]+)(#.*)?$/u.exec(href);
  if (page) return o.pageHref(page[1]!, page[2] ?? "");
  const file = /^\/chest\/files\/([0-9]+)/u.exec(href);
  if (file) return o.fileHref(file[1]!);
  return href;
}

function mdInline(nodes: DocNode[] | undefined, o: MarkdownOptions): string {
  let out = "";
  for (const n of nodes ?? []) {
    if (n.type === "hardBreak") {
      out += "\\\n";
      continue;
    }
    if (n.type === "pageRef") {
      const id = String(n.attrs?.["id"]);
      const title = o.title(id);
      out += title === undefined ? escapeText(o.missing) : `[${escapeText(title)}](${escapeUrl(o.pageHref(id, ""))})`;
      continue;
    }
    const marks = n.marks ?? [];
    const code = marks.some(m => m.type === "code");
    let text = code ? "`" + (n.text ?? "").replace(/`/gu, "ˋ") + "`" : escapeText(n.text ?? "");
    if (!code) {
      // Emphasis cannot start or end with a space in Markdown: keep it outside.
      const lead = /^\s*/u.exec(text)![0];
      const trail = /\s*$/u.exec(text)![0];
      let core = text.trim();
      if (core !== "") {
        if (marks.some(m => m.type === "strike")) core = `~~${core}~~`;
        if (marks.some(m => m.type === "italic")) core = `*${core}*`;
        if (marks.some(m => m.type === "bold")) core = `**${core}**`;
        if (marks.some(m => m.type === "underline")) core = `<u>${core}</u>`;
      }
      text = lead + core + trail;
    }
    const link = marks.find(m => m.type === "link");
    if (link) text = `[${text}](${escapeUrl(mdLink(String(link.attrs?.["href"] ?? ""), o))})`;
    out += text;
  }
  return out;
}

export function toMarkdown(doc: Doc, o: MarkdownOptions): string {
  const block = (n: DocNode, indent: string): string => {
    switch (n.type) {
      case "paragraph":
        return indent + mdInline(n.content, o).replace(/\n/gu, "\n" + indent);
      case "heading":
        return indent + "#".repeat(Number(n.attrs?.["level"] ?? 1) + 1) + " " + mdInline(n.content, o);
      case "blockquote":
      case "callout": {
        const inside = (n.content ?? []).map(c => block(c, "")).join("\n\n");
        const lead = n.type === "callout" ? `[!${n.attrs?.["tone"] === "tip" ? "TIP" : n.attrs?.["tone"] === "warning" ? "WARNING" : "NOTE"}]\n` : "";
        return (lead + inside).split("\n").map(l => indent + ("> " + l).trimEnd()).join("\n");
      }
      case "bulletList":
      case "orderedList":
      case "taskList": {
        let number = Number(n.attrs?.["start"] ?? 1);
        return (n.content ?? []).map(item => {
          const marker = n.type === "orderedList" ? `${number++}. ` : n.type === "taskList" ? `- [${item.attrs?.["checked"] ? "x" : " "}] ` : "- ";
          const pad = indent + " ".repeat(n.type === "taskList" ? 2 : marker.length);
          const [first, ...rest] = item.content ?? [];
          const head = indent + marker + (first ? block(first, "").replace(/\n/gu, "\n" + pad) : "");
          // A list inside an item follows it closely (a tight list).
          return rest.reduce((text, c) => text + (c.type.endsWith("List") ? "\n" : "\n\n") + block(c, pad), head);
        }).join("\n");
      }
      case "codeBlock": {
        const text = (n.content ?? []).map(c => c.text ?? "").join("");
        const fence = text.includes("```") ? "~~~~" : "```";
        return [indent + fence + String(n.attrs?.["language"] ?? ""), ...text.split("\n").map(l => indent + l), indent + fence].join("\n");
      }
      case "horizontalRule":
        return indent + "---";
      case "image": {
        const src = String(n.attrs?.["src"] ?? "");
        const alt = String(n.attrs?.["alt"] ?? "");
        return indent + `![${escapeText(alt)}](${escapeUrl(mdLink(src, o))})`;
      }
      case "table": {
        const rows = (n.content ?? []).map(r => (r.content ?? []).map(c => (c.content ?? []).map(p => mdInline(p.content, o)).join(" ").replace(/\n/gu, " ") || " "));
        if (rows.length === 0) return "";
        const width = Math.max(...rows.map(r => r.length));
        const line = (cells: string[]) => indent + "| " + Array.from({ length: width }, (_, k) => cells[k] ?? " ").join(" | ") + " |";
        return [line(rows[0]!), indent + "|" + " --- |".repeat(width), ...rows.slice(1).map(line)].join("\n");
      }
      default:
        return "";
    }
  };
  return doc.content.map(n => block(n, "")).filter(s => s.trim() !== "").join("\n\n") + "\n";
}
