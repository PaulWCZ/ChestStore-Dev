import { parseDocument } from "htmlparser2";
import type { Doc, DocNode, Mark } from "./doc.ts";
import { readZip, type ZipEntry } from "./zip.ts";

// Word documents in (.docx, Office Open XML — ECMA-376): a handbook kept
// in Word, or a Google Docs document downloaded as .docx, becomes a page.
// Read: paragraphs, the headings (by their style's name, whatever the
// language of Word: "heading 1" is "Titre 1" on screen, the same inside),
// the title, bold, italics, underline, strike-through, line breaks, links
// to the web, bulleted and numbered lists (nested), tables and pictures.
// Left out: comments, tracked changes (the text as accepted), headers and
// footers, footnotes, text boxes, fields' codes, colours and fonts. Like
// fromMarkdown(), the document is NOT normalized yet: its images point to
// the pictures inside the file, named "<file>_media/<picture>", which the
// importer adds to the import's files.

type X = { type: string; name: string; attribs: Record<string, string>; children: X[]; data?: string };

const kids = (x: X | undefined, name?: string): X[] => (x?.children ?? []).filter(c => c.type === "tag" && (name === undefined || c.name === name));
const kid = (x: X | undefined, name: string): X | undefined => kids(x, name)[0];
function all(x: X | undefined, name: string, out: X[] = []): X[] {
  for (const c of x?.children ?? []) {
    if (c.type !== "tag") continue;
    if (c.name === name) out.push(c);
    all(c, name, out);
  }
  return out;
}
const xml = (data: Uint8Array | undefined): X | undefined => (data ? (parseDocument(new TextDecoder().decode(data), { xmlMode: true }) as unknown as X) : undefined);
// A switch in a run's or paragraph's properties: present and not turned off.
const on = (x: X | undefined): boolean => x !== undefined && !["0", "false", "none"].includes(x.attribs["w:val"] ?? "");

export type DocxPage = { title: string | null; doc: Doc; media: ZipEntry[] };

export function fromDocx(name: string, bytes: Uint8Array): DocxPage {
  const entries = readZip(bytes, n => n === "word/document.xml" || n === "word/styles.xml" || n === "word/numbering.xml" || n === "word/_rels/document.xml.rels" || n === "docProps/core.xml" || n.startsWith("word/media/"));
  const byName = new Map(entries.map(e => [e.name, e]));
  const document = xml(byName.get("word/document.xml")?.data);
  const body = kid(kid(document, "w:document"), "w:body");
  if (!body) return { title: null, doc: { type: "doc", content: [{ type: "paragraph" }] }, media: [] };

  // Styles: their id → their name ("Heading1" or "Titre1" → "heading 1"),
  // and the list a style puts its paragraphs in ("List Bullet").
  const styles = new Map<string, string>();
  const styleLists = new Map<string, X>();
  for (const s of all(xml(byName.get("word/styles.xml")?.data), "w:style")) {
    const id = s.attribs["w:styleId"];
    const styleName = kid(s, "w:name")?.attribs["w:val"];
    if (id && styleName) styles.set(id, styleName.toLowerCase());
    const num = kid(kid(s, "w:pPr"), "w:numPr");
    if (id && num) styleLists.set(id, num);
  }
  // Lists: numId → level → bullet or numbered.
  const numbering = xml(byName.get("word/numbering.xml")?.data);
  const abstracts = new Map<string, Map<string, string>>();
  for (const a of all(numbering, "w:abstractNum")) {
    const levels = new Map<string, string>();
    for (const l of kids(a, "w:lvl")) levels.set(l.attribs["w:ilvl"] ?? "0", kid(l, "w:numFmt")?.attribs["w:val"] ?? "bullet");
    abstracts.set(a.attribs["w:abstractNumId"] ?? "", levels);
  }
  const lists = new Map<string, Map<string, string>>();
  for (const n of all(numbering, "w:num")) lists.set(n.attribs["w:numId"] ?? "", abstracts.get(kid(n, "w:abstractNumId")?.attribs["w:val"] ?? "") ?? new Map());
  // Relations: links to the web, pictures inside.
  const rels = new Map<string, { target: string; external: boolean }>();
  for (const r of all(xml(byName.get("word/_rels/document.xml.rels")?.data), "Relationship")) rels.set(r.attribs["Id"] ?? "", { target: r.attribs["Target"] ?? "", external: r.attribs["TargetMode"] === "External" });
  const base = name.split("/").at(-1)!;
  const media = new Map<string, string>();
  const imageOf = (id: string): string | null => {
    const rel = rels.get(id);
    if (!rel || rel.external) return null;
    const path = "word/" + rel.target.replace(/^\/?word\//u, "").replace(/^\.\//u, "");
    if (!byName.has(path)) return null;
    const local = `${base}_media/${path.split("/").at(-1)}`;
    media.set(local, path);
    return local;
  };

  const styleOf = (p: X): string => styles.get(kid(kid(p, "w:pPr"), "w:pStyle")?.attribs["w:val"] ?? "") ?? "";

  // The runs of a paragraph (and of its links, insertions and fields) as
  // inline nodes; pictures come out as images (blocks here).
  const inline = (x: X, marks: Mark[]): DocNode[] => {
    const out: DocNode[] = [];
    for (const c of kids(x)) {
      if (c.name === "w:r") {
        const pr = kid(c, "w:rPr");
        const own: Mark[] = [...marks];
        const add = (type: string) => { if (!own.some(m => m.type === type)) own.push({ type }); };
        if (on(kid(pr, "w:b"))) add("bold");
        if (on(kid(pr, "w:i"))) add("italic");
        if (on(kid(pr, "w:u"))) add("underline");
        if (on(kid(pr, "w:strike")) || on(kid(pr, "w:dstrike"))) add("strike");
        for (const part of kids(c)) {
          if (part.name === "w:t") {
            const text = (part.children ?? []).map(t => t.data ?? "").join("");
            if (text) out.push(own.length > 0 ? { type: "text", text, marks: own.map(m => ({ ...m })) } : { type: "text", text });
          } else if (part.name === "w:tab") out.push({ type: "text", text: " " });
          else if (part.name === "w:br" || part.name === "w:cr") out.push({ type: "hardBreak" });
          else if (part.name === "w:drawing" || part.name === "w:pict") {
            for (const blip of [...all(part, "a:blip"), ...all(part, "v:imagedata")]) {
              const src = imageOf(blip.attribs["r:embed"] ?? blip.attribs["r:id"] ?? "");
              const alt = all(part, "wp:docPr")[0]?.attribs["descr"] ?? "";
              if (src) out.push({ type: "image", attrs: { src, alt } });
            }
          }
        }
      } else if (c.name === "w:hyperlink") {
        const rel = rels.get(c.attribs["r:id"] ?? "");
        out.push(...inline(c, rel?.external ? [...marks, { type: "link", attrs: { href: rel.target } }] : marks));
      } else if (c.name === "w:ins" || c.name === "w:smartTag" || c.name === "w:fldSimple" || c.name === "w:sdt" || c.name === "w:sdtContent") {
        out.push(...inline(c, marks));
      }
      // w:del (a deletion not accepted yet), comments, bookmarks: left out.
    }
    return out;
  };

  // A paragraph's inline content as paragraphs, split around its pictures.
  const split = (content: DocNode[], wrap: (c: DocNode[]) => DocNode): DocNode[] => {
    const out: DocNode[] = [];
    let run: DocNode[] = [];
    const flush = () => {
      if (run.some(n => n.type !== "hardBreak" && (n.type !== "text" || (n.text ?? "").trim() !== ""))) out.push(wrap(run));
      run = [];
    };
    for (const n of content) {
      if (n.type === "image") {
        flush();
        out.push(n);
      } else run.push(n);
    }
    flush();
    return out;
  };

  let title: string | null = null;
  const blocks = (container: X): DocNode[] => {
    const out: DocNode[] = [];
    // The list being built: a stack of open lists, one per level.
    let stack: { level: number; list: DocNode }[] = [];
    const endList = () => { stack = []; };
    for (const c of kids(container)) {
      if (c.name === "w:sdt") {
        endList();
        out.push(...blocks(kid(c, "w:sdtContent") ?? c));
        continue;
      }
      if (c.name === "w:tbl") {
        endList();
        out.push(table(c));
        continue;
      }
      if (c.name !== "w:p") continue;
      const style = styleOf(c);
      const content = inline(c, []);
      const heading = /^heading ([1-6])$/u.exec(style);
      if (style === "title" && title === null) {
        endList();
        title = content.map(n => n.text ?? "").join("").trim() || null;
        continue;
      }
      if (heading) {
        endList();
        out.push(...split(content, run => ({ type: "heading", attrs: { level: Math.min(Number(heading[1]), 3) }, content: run })));
        continue;
      }
      const styleId = kid(kid(c, "w:pPr"), "w:pStyle")?.attribs["w:val"] ?? "";
      const num = kid(kid(c, "w:pPr"), "w:numPr") ?? styleLists.get(styleId);
      const numId = kid(num, "w:numId")?.attribs["w:val"];
      if (num && numId && numId !== "0") {
        // "List Bullet 2" is the second level, whatever its numbering says.
        const named = /^list (bullet|number)(?: ([2-9]))?$/u.exec(style);
        const level = named?.[2] ? Number(named[2]) - 1 : Number(kid(num, "w:ilvl")?.attribs["w:val"] ?? 0);
        const format = named ? (named[1] === "bullet" ? "bullet" : "decimal") : lists.get(numId)?.get(String(level)) ?? "bullet";
        const type = format === "bullet" || format === "none" ? "bulletList" : "orderedList";
        const item: DocNode = { type: "listItem", content: split(content, run => ({ type: "paragraph", content: run })) };
        if (item.content!.length === 0) item.content = [{ type: "paragraph" }];
        while (stack.length > 0 && stack.at(-1)!.level > level) stack.pop();
        const top = stack.at(-1);
        if (top && top.level === level && top.list.type === type) top.list.content!.push(item);
        else if (top && top.level < level) {
          // Deeper: a list inside the last item.
          const list: DocNode = { type, content: [item] };
          const last = top.list.content!.at(-1)!;
          last.content = [...(last.content ?? []), list];
          stack.push({ level, list });
        } else {
          if (top && top.level === level) stack.pop();
          const list: DocNode = { type, content: [item] };
          if (stack.length === 0) out.push(list);
          else {
            const last = stack.at(-1)!.list.content!.at(-1)!;
            last.content = [...(last.content ?? []), list];
          }
          stack.push({ level, list });
        }
        continue;
      }
      endList();
      const quote = style === "quote" || style === "intense quote";
      const made = split(content, run => ({ type: "paragraph", content: run }));
      if (quote && made.length > 0) out.push({ type: "blockquote", content: made });
      else out.push(...made);
    }
    return out;
  };

  const table = (t: X): DocNode => {
    const rows = kids(t, "w:tr").map(tr => {
      const header = on(kid(kid(tr, "w:trPr"), "w:tblHeader"));
      const cells = kids(tr, "w:tc").map(tc => {
        const span = Number(kid(kid(tc, "w:tcPr"), "w:gridSpan")?.attribs["w:val"] ?? 1);
        const inner = blocks(tc);
        return { type: header ? "tableHeader" : "tableCell", ...(span > 1 ? { attrs: { colspan: span } } : {}), content: inner.length > 0 ? inner : [{ type: "paragraph" }] };
      });
      return { type: "tableRow", content: cells };
    }).filter(r => r.content.length > 0);
    return { type: "table", content: rows };
  };

  const content = blocks(body);
  if (title === null) {
    const core = xml(byName.get("docProps/core.xml")?.data);
    const named = all(core, "dc:title")[0];
    const text = (named?.children ?? []).map(t => t.data ?? "").join("").trim();
    if (text) title = text;
  }
  return {
    title,
    doc: { type: "doc", content: content.length > 0 ? content : [{ type: "paragraph" }] },
    media: [...media].map(([local, path]) => ({ name: name.split("/").slice(0, -1).concat(local).join("/"), data: byName.get(path)!.data })),
  };
}
