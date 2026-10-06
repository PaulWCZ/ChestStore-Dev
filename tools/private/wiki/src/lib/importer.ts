import { randomBytes } from "node:crypto";
import type { Member } from "@argentic/chest-sdk/member";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as chestFiles from "@argentic/chest-sdk/files";
import { json, type Sql } from "./db.ts";
import { mapDoc, normalize, type Doc, type DocNode } from "./doc.ts";
import { AppError } from "./errors.ts";
import { attach, folderOf, imageTypes } from "./files.ts";
import { fromDocx } from "./docx.ts";
import { classMarks, confluencePage, confluenceTree, find, htmlToDoc, parseHtml, textOf, type ConfluencePage } from "./html.ts";
import { fromMarkdown, takeTitle } from "./markdown.ts";
import { clean, limits } from "./model.ts";
import { writeContent } from "./pages.ts";
import { between } from "./position.ts";
import { createSpace, space } from "./spaces.ts";
import { readZip, zipBudget, type ZipBudget, type ZipEntry } from "./zip.ts";

// Imports: Markdown files, or a zip of them — a Notion export ("Markdown &
// CSV"), an Obsidian vault, any folder of .md files; a Confluence space
// exported as HTML (zip); a Google Docs document downloaded as a web page
// (zip), or any .html files; Word documents (.docx, lib/docx.ts). Folders become the page tree (a Confluence
// export: its own tree, from index.html, or each page's breadcrumbs); links between the files become links between the new pages;
// images and files the pages point to go to the Chest (when it keeps files
// for the wiki) and show in the pages. What cannot come (Notion databases as
// CSV, other files, images when the Chest keeps no files) is counted and
// said.
//
// Notion names each file and folder "Title <32 hex>"; the ids are taken out
// of titles and paths. A page's first "# Title" is its title.

export type ImportFile = { name: string; data: Uint8Array };
// Words the import writes into pages (in the importer's language).
export type ImportWords = { untitled: string; attachments: string };
export type ImportResult = { spaceId: string; firstPageId: string | null; pages: number; files: number; skipped: { files: string[]; images: number } };

const pageExtensions = /\.(md|markdown|txt|html?)$/iu;
const htmlFile = /\.html?$/iu;
// The furniture of a Confluence export (its styles, scripts, icons): not
// the space's content, not worth a word.
const furniture = /(^|\/)(styles|images\/icons|js)\/|\.(css|js)$/iu;
const fileTypes: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  pdf: "application/pdf", txt: "text/plain", csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text", ods: "application/vnd.oasis.opendocument.spreadsheet",
  mp4: "video/mp4", mp3: "audio/mpeg", zip: "application/zip",
};
const extOf = (name: string): string => /\.([a-z0-9]{1,8})$/iu.exec(name)?.[1]?.toLowerCase() ?? "";

// Notion's " <32 hex>" after a title, in a file or folder name.
const stripId = (segment: string): string => segment.replace(/\s+[0-9a-f]{32}(?=(\.[a-z0-9]+)?$)/iu, "").replace(/\s+[0-9a-f]{32}$/iu, "");
const keyOf = (path: string): string => path.split("/").map(stripId).join("/").replace(pageExtensions, "").toLowerCase();
const titleOf = (path: string): string => stripId(path.split("/").at(-1)!.replace(pageExtensions, "")).replace(/[_]+/gu, " ").trim();

// expand opens the zips (and the zips a Notion export puts in its zip):
// their directories only — an entry is inflated when it is read, and one
// budget (zipLimits.total) covers the archives and those inside them.
function expand(files: ImportFile[], budget: ZipBudget): { entries: ZipEntry[]; skipped: string[] } {
  const entries: ZipEntry[] = [];
  const skipped: string[] = [];
  for (const f of files) {
    if (/\.zip$/iu.test(f.name)) {
      for (const e of readZip(f.data, undefined, budget)) {
        if (/\.zip$/iu.test(e.name)) entries.push(...readZip(e.data, undefined, budget));
        else entries.push(e);
      }
    } else entries.push({ name: f.name.split(/[\\/]/u).at(-1) ?? f.name, size: f.data.byteLength, data: f.data });
  }
  const kept: ZipEntry[] = [];
  for (const e of entries) {
    if (pageExtensions.test(e.name) || extOf(e.name) in fileTypes) kept.push(e);
    else if (!furniture.test(e.name)) skipped.push(e.name.split("/").at(-1)!);
  }
  return { entries: kept, skipped };
}

// Where a relative link of a file leads, as a path of the archive.
function resolve(from: string, href: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/iu.test(href) || href.startsWith("#") || href.startsWith("/")) return null;
  let target: string;
  try {
    target = decodeURIComponent(href.split(/[?#]/u)[0]!);
  } catch {
    return null;
  }
  const parts = from.split("/").slice(0, -1);
  for (const p of target.split("/")) {
    if (p === "..") parts.pop();
    else if (p !== "." && p !== "") parts.push(p);
  }
  return parts.join("/");
}

// A page to make: `parent` is the key of the page above it (a folder's, or
// the one a Confluence export names); `order` keeps an export's order
// among siblings (else by title); `attachments` are files the page lists
// without showing them (Confluence), linked at its end.
// `at`: when the page was last changed where it comes from (Confluence
// says it): its version keeps that date, so "Recently updated" is not
// flooded with a migration. `content` reads the page's document when its
// turn comes (its file inflated and parsed again then): a 500-page import
// never holds every page's document at once.
type Planned = { key: string; path: string | null; title: string; parent: string | null; content: (() => Doc) | null; order: number; attachments?: { href: string; name: string }[]; id?: string; at?: Date };

// The pages of HTML files: a Confluence space export (its pages, its tree
// from index.html or the breadcrumbs), or web pages of their own (a Google
// Docs download…), each a page whose folder is its parent. One file at a
// time: inflated, parsed, turned into the wiki's document, dropped — a
// 500-page export never holds more than one page's DOM.
type Read = { entry: ZipEntry; confluence: Omit<ConfluencePage, "content"> | null; index: ReturnType<typeof confluenceTree>; plain: { title: string } | null };
function htmlPages(entries: ZipEntry[], skipped: string[]): Planned[] {
  // Confluence's page ids, from its file names ("Title_12345.html", "12345.html").
  const byPageId = new Map<string, string>();
  for (const e of entries.filter(x => htmlFile.test(x.name))) {
    const m = /(?:^|[_/])(\d{3,})\.html?$/iu.exec(e.name);
    if (m) byPageId.set(m[1]!, e.name);
  }
  // A page's document from its file, read again (its DOM dropped after).
  const relativeTo = (name: string) => (id: string) => {
      const file = byPageId.get(id);
      if (!file) return null;
      const from = name.split("/").slice(0, -1);
      const to = file.split("/");
      return from.every((part, i) => to[i] === part) ? to.slice(from.length).join("/") : null;
  };
  const plainDoc = (root: ReturnType<typeof parseHtml>) => takeTitle(htmlToDoc(find(root, x => x.name === "body") ?? root, { classes: classMarks(root) }));
  const contentOf = (e: ZipEntry, confluence: boolean) => (): Doc => {
    const root = parseHtml(new TextDecoder().decode(e.data));
    const page = confluence ? confluencePage(root) : null;
    return page ? htmlToDoc(page.content, { pageFile: relativeTo(e.name) }) : plainDoc(root).doc;
  };
  const read: Read[] = [];
  for (const e of entries.filter(x => htmlFile.test(x.name))) {
    if (e.size > limits.importHtml) {
      skipped.push(e.name.split("/").at(-1)!);
      continue;
    }
    const name = e.name;
    const root = parseHtml(new TextDecoder().decode(e.data));
    const page = confluencePage(root);
    const index = /(^|\/)index\.html?$/iu.test(name) ? confluenceTree(root) : null;
    let plain: Read["plain"] = null;
    let confluence: Read["confluence"] = null;
    // Only what the plan needs is kept: the DOM goes with this turn.
    if (page) confluence = { title: page.title, crumbs: page.crumbs, attachments: page.attachments, updated: page.updated };
    else {
      const lead = plainDoc(root);
      const named = find(root, x => x.name === "title");
      plain = { title: lead.title ?? (named ? textOf(named).replace(/\s+/gu, " ").trim() : "") ?? "" };
    }
    read.push({ entry: e, confluence, index, plain });
  }
  const confluence = new Map(read.filter(r => r.confluence).map(r => [r.entry.name, r.confluence!]));
  const isConfluence = confluence.size > 0;
  const tree = new Map<string, { parent: string | null; order: number }>();
  // The export's index (the space's details and its tree) is not a page.
  const indexes = new Set<string>();
  if (isConfluence) {
    for (const r of read.filter(x => x.index)) {
      indexes.add(r.entry.name);
      for (const [order, item] of r.index!.entries()) {
        const file = resolve(r.entry.name, item.file);
        if (file) tree.set(file, { parent: item.parent === null ? null : resolve(r.entry.name, item.parent), order });
      }
    }
  }
  const out: Planned[] = [];
  for (const r of read) {
    const name = r.entry.name;
    const page = r.confluence;
    if (isConfluence && (!page || indexes.has(name))) continue; // index.html and other furniture of the export
    if (page) {
      const placed = tree.get(name);
      // Without the index: the last breadcrumb that is a page of the export.
      const crumb = [...page.crumbs].reverse().map(c => resolve(name, c)).find(c => c !== null && c !== name && confluence.get(c));
      const above = placed ? placed.parent : crumb ?? null;
      const parent = above && confluence.get(above) ? keyOf(above) : null;
      out.push({ key: keyOf(name), path: name, title: page.title || titleOf(name), parent, content: contentOf(r.entry, true), order: placed?.order ?? Number.MAX_SAFE_INTEGER, attachments: page.attachments, ...(page.updated ? { at: page.updated } : {}) });
      continue;
    }
    const key = keyOf(name);
    const parts = key.split("/");
    out.push({ key, path: name, title: r.plain!.title || titleOf(name), parent: parts.length > 1 ? parts.slice(0, -1).join("/") : null, content: contentOf(r.entry, false), order: 0 });
  }
  return out;
}

export async function importFiles(sql: Sql, actor: Member | null, input: { spaceId?: unknown; spaceName?: unknown; files: ImportFile[]; words: ImportWords }): Promise<ImportResult> {
  // The target first: an existing space the actor writes in, or a new one.
  const target = input.spaceId ? await space(sql, actor, input.spaceId, "write") : null;
  if (!target && typeof input.spaceName !== "string") throw new AppError("invalid");
  if (input.files.reduce((n, f) => n + f.data.byteLength, 0) > limits.importBytes) throw new AppError("file_too_large");
  const budget = zipBudget();
  const { entries, skipped } = expand(input.files, budget);
  // Word documents are pages when nothing else is (in a Notion export, a
  // .docx is a file a page links to): each becomes a page, its pictures
  // files of the import.
  const docx: Planned[] = [];
  if (!entries.some(e => pageExtensions.test(e.name))) {
    for (const e of entries.filter(x => extOf(x.name) === "docx")) {
      entries.splice(entries.indexOf(e), 1);
      let read: ReturnType<typeof fromDocx>;
      try {
        read = fromDocx(e.name, e.data, budget);
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        skipped.push(e.name.split("/").at(-1)!);
        continue;
      }
      entries.push(...read.media);
      const lead = read.title === null ? takeTitle(read.doc) : { title: read.title, doc: read.doc };
      const key = e.name.replace(/\.docx$/iu, "").split("/").map(stripId).join("/").toLowerCase();
      const parts = key.split("/");
      docx.push({ key, path: e.name, title: lead.title ?? titleOf(e.name.replace(/\.docx$/iu, ".md")), parent: parts.length > 1 ? parts.slice(0, -1).join("/") : null, content: () => lead.doc, order: 0 });
    }
  }
  const byPath = new Map(entries.map(e => [e.name, e]));
  const assetsByKey = new Map(entries.filter(e => !pageExtensions.test(e.name)).map(e => [e.name.split("/").map(stripId).join("/").toLowerCase(), e]));

  // The pages: each Markdown file, and each folder that holds some without
  // a file of its own (it becomes an empty page, their parent).
  const planned = new Map<string, Planned>();
  for (const p of [...docx, ...htmlPages(entries, skipped)]) planned.set(p.key, p);
  for (const e of entries.filter(x => pageExtensions.test(x.name) && !htmlFile.test(x.name))) {
    if (e.size > limits.importFile) {
      skipped.push(e.name.split("/").at(-1)!);
      continue;
    }
    const key = keyOf(e.name);
    const parts = key.split("/");
    const parent = parts.length > 1 ? parts.slice(0, -1).join("/") : null;
    const read = () => takeTitle(fromMarkdown(new TextDecoder().decode(e.data)));
    planned.set(key, { key, path: e.name, title: read().title ?? titleOf(e.name), parent, content: () => read().doc, order: 0 });
  }
  // The folders above them. A lone top folder (the zip's own name) is not a page.
  for (const p of [...planned.values()]) {
    let parent = p.parent;
    const raw = p.path!.split("/");
    let depth = raw.length - 1;
    while (parent !== null && !planned.has(parent)) {
      const parts = parent.split("/");
      planned.set(parent, { key: parent, path: null, title: stripId(raw[depth - 1] ?? parts.at(-1)!).trim(), parent: parts.length > 1 ? parts.slice(0, -1).join("/") : null, content: null, order: 0 });
      parent = parts.length > 1 ? parts.slice(0, -1).join("/") : null;
      depth--;
    }
  }
  const tops = [...planned.values()].filter(p => p.parent === null);
  if (tops.length === 1 && tops[0]!.path === null) {
    const root = tops[0]!.key;
    planned.delete(root);
    for (const p of planned.values()) if (p.parent === root) p.parent = null;
  }
  if (planned.size === 0) throw new AppError("import_empty");
  if (planned.size > limits.importPages) throw new AppError("too_many", { max: limits.importPages });
  const [count] = await sql<{ n: number }[]>`select count(*)::int as n from pages`;
  if ((count?.n ?? 0) + planned.size > limits.pages) throw new AppError("too_many", { max: limits.pages });

  // A tree that loops (a broken export) is cut where it loops.
  for (const p of planned.values()) {
    const seen = new Set([p.key]);
    for (let up = p.parent; up !== null; up = planned.get(up)?.parent ?? null) {
      if (seen.has(up)) {
        p.parent = null;
        break;
      }
      seen.add(up);
    }
  }
  // Parents before children; in the export's order, else by title, among siblings.
  const depthOf = (p: Planned): number => (p.parent === null ? 0 : 1 + depthOf(planned.get(p.parent)!));
  const order = [...planned.values()].sort((a, b) => depthOf(a) - depthOf(b) || a.order - b.order || a.title.localeCompare(b.title));
  if (order.some(p => depthOf(p) >= limits.depth)) throw new AppError("too_many", { max: limits.depth });

  const s = target ?? await createSpace(sql, actor, { name: clean(input.spaceName, limits.spaceName) });
  const uploaded: string[] = [];
  const used = new Set<string>();
  let files = 0;
  let images = 0;
  try {
    const result = await sql.begin(async tx => {
      // First the pages, empty, so that links can name them.
      const last = new Map<string | null, string | null>();
      const [top] = await tx<{ last: string | null }[]>`select max(position) as last from pages where space_id = ${s.id} and parent_id is null and deleted_at is null`;
      last.set(null, top?.last ?? null);
      for (const p of order) {
        const parentId = p.parent === null ? null : planned.get(p.parent)!.id!;
        const position = between(last.get(p.parent) ?? null, null);
        last.set(p.parent, position);
        const title = clean(p.title || input.words.untitled, limits.title);
        const [row] = await tx<{ id: string }[]>`
          insert into pages (space_id, parent_id, position, title, doc, version, created_by, updated_by)
          values (${s.id}, ${parentId}, ${position}, ${title}, ${tx.json(json({ type: "doc", content: [{ type: "paragraph" }] }))}, 0, ${actor!.id}, ${actor!.id}) returning id`;
        p.id = String(row!.id);
        p.title = title;
      }
      // Then their content, with links and files made local.
      for (const p of order) {
        const source = p.content?.() ?? { type: "doc" as const, content: [{ type: "paragraph" }] };
        // The files a page lists without showing them (Confluence's
        // attachments): linked under a heading at its end.
        const names = new Map<string, string>();
        if (p.attachments && p.attachments.length > 0) {
          const shown = new Set<string>();
          const look = (n: DocNode) => {
            const src = n.type === "image" ? resolve(p.path ?? "", String(n.attrs?.["src"] ?? "")) : null;
            if (src) shown.add(src);
            for (const m of n.marks ?? []) if (m.type === "link") { const h = resolve(p.path ?? "", String(m.attrs?.["href"] ?? "")); if (h) shown.add(h); }
            for (const c of n.content ?? []) look(c);
          };
          source.content.forEach(look);
          const listed = p.attachments.filter(a => {
            const path = resolve(p.path ?? "", a.href);
            if (path) names.set(path, a.name);
            return path !== null && byPath.has(path) && !shown.has(path);
          });
          if (listed.length > 0) {
            source.content.push({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: input.words.attachments }] });
            source.content.push({ type: "bulletList", content: listed.map(a => ({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: a.name, marks: [{ type: "link", attrs: { href: a.href } }] }] }] })) });
          }
        }
        // Each file once per page, however often the page shows it.
        const sent = new Map<string, string | null>();
        const asset = async (href: string): Promise<string | null> => {
          const path = resolve(p.path ?? "", href);
          if (path === null) return null;
          if (sent.has(path)) return sent.get(path)!;
          const id = await send(path);
          sent.set(path, id);
          return id;
        };
        const send = async (path: string): Promise<string | null> => {
          const entry = byPath.get(path) ?? assetsByKey.get(path.split("/").map(stripId).join("/").toLowerCase());
          if (!entry) return null;
          const ext = extOf(entry.name);
          const type = fileTypes[ext] ?? "application/octet-stream";
          if (entry.size > limits.fileSize) return null;
          const object = `${folderOf(p.id!)}${randomBytes(10).toString("hex")}.${ext || "bin"}`;
          // Read (inflated) now, sent, then dropped: one file at a time.
          try {
            await chestFiles.put(object, entry.data, type);
          } catch (error) {
            if (error instanceof ChestError) return null;
            throw error;
          }
          uploaded.push(object);
          used.add(entry.name);
          const saved = await attach(tx, actor, p.id, { object, fileName: names.get(path) ?? stripId(entry.name.split("/").at(-1)!), type, size: entry.size });
          files++;
          return saved.id;
        };
        const rewrites = new Map<DocNode, DocNode | null>();
        const visit = async (n: DocNode) => {
          if (n.type === "image") {
            const src = String(n.attrs?.["src"] ?? "");
            const fileId = imageTypes.includes(fileTypes[extOf(src.split(/[?#]/u)[0]!)] ?? "") ? await asset(src) : null;
            if (fileId) rewrites.set(n, { ...n, attrs: { ...n.attrs, src: `/chest/files/${fileId}` } });
            else {
              images++;
              rewrites.set(n, null);
            }
          }
          for (const m of n.marks ?? []) {
            if (m.type !== "link") continue;
            const href = String(m.attrs?.["href"] ?? "");
            const path = resolve(p.path ?? "", href);
            if (path === null) continue;
            const linked = planned.get(keyOf(path));
            if (linked?.id) m.attrs = { href: `/chest/pages/${linked.id}` };
            else {
              const fileId = await asset(href);
              if (fileId) m.attrs = { href: `/chest/files/${fileId}?download` };
            }
          }
          for (const c of n.content ?? []) await visit(c);
        };
        for (const n of source.content) await visit(n);
        const doc = normalize(mapDoc(source, n => (rewrites.has(n) ? rewrites.get(n)! : n)));
        await writeContent(tx, p.id!, actor!.id, { title: p.title, doc, kind: "imported", ...(p.at ? { at: p.at } : {}) });
      }
      return { spaceId: s.id, firstPageId: order.find(p => p.parent === null)?.id ?? null, pages: order.length };
    });
    // Files no page pointed to (a Notion database's CSV…) did not come.
    for (const e of entries) if (!pageExtensions.test(e.name) && !used.has(e.name) && !furniture.test(e.name)) skipped.push(e.name.split("/").at(-1)!);
    return { ...result, files, skipped: { files: skipped, images } };
  } catch (error) {
    for (const object of uploaded) await chestFiles.delete(object).catch(() => false);
    // A space made for this import goes with it.
    if (!target) await sql`delete from spaces where id = ${s.id} and not exists (select 1 from pages where space_id = ${s.id})`;
    throw error;
  }
}
