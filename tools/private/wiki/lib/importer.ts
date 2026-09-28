import { randomBytes } from "node:crypto";
import type { Member } from "@argentic/chest-sdk/member";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as chestFiles from "@argentic/chest-sdk/files";
import { json, type Sql } from "./db.ts";
import { mapDoc, normalize, type Doc, type DocNode } from "./doc.ts";
import { AppError } from "./errors.ts";
import { attach, folderOf, imageTypes } from "./files.ts";
import { fromMarkdown, takeTitle } from "./markdown.ts";
import { clean, limits } from "./model.ts";
import { writeContent } from "./pages.ts";
import { between } from "./position.ts";
import { createSpace, space } from "./spaces.ts";
import { readZip, type ZipEntry } from "./zip.ts";

// Imports: Markdown files, or a zip of them — a Notion export ("Markdown &
// CSV"), an Obsidian vault, any folder of .md files. Folders become the
// page tree; links between the files become links between the new pages;
// images and files the pages point to go to the Chest (when it keeps files
// for the wiki) and show in the pages. What cannot come (Notion databases as
// CSV, other files, images when the Chest keeps no files) is counted and
// said.
//
// Notion names each file and folder "Title <32 hex>"; the ids are taken out
// of titles and paths. A page's first "# Title" is its title.

export type ImportFile = { name: string; data: Uint8Array };
export type ImportResult = { spaceId: string; firstPageId: string | null; pages: number; files: number; skipped: { files: string[]; images: number } };

const pageExtensions = /\.(md|markdown|txt)$/iu;
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

// expand opens the zips (and the zips a Notion export puts in its zip).
function expand(files: ImportFile[]): { entries: ZipEntry[]; skipped: string[] } {
  const entries: ZipEntry[] = [];
  const skipped: string[] = [];
  for (const f of files) {
    if (/\.zip$/iu.test(f.name)) {
      for (const e of readZip(f.data)) {
        if (/\.zip$/iu.test(e.name)) entries.push(...readZip(e.data));
        else entries.push(e);
      }
    } else entries.push({ name: f.name.split(/[\\/]/u).at(-1) ?? f.name, data: f.data });
  }
  const kept: ZipEntry[] = [];
  for (const e of entries) {
    if (pageExtensions.test(e.name) || extOf(e.name) in fileTypes) kept.push(e);
    else skipped.push(e.name.split("/").at(-1)!);
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

type Planned = { key: string; path: string | null; title: string; parent: string | null; doc: Doc | null; id?: string };

export async function importFiles(sql: Sql, actor: Member | null, input: { spaceId?: unknown; spaceName?: unknown; files: ImportFile[]; untitled: string }): Promise<ImportResult> {
  // The target first: an existing space the actor writes in, or a new one.
  const target = input.spaceId ? await space(sql, actor, input.spaceId, "write") : null;
  if (!target && typeof input.spaceName !== "string") throw new AppError("invalid");
  if (input.files.reduce((n, f) => n + f.data.byteLength, 0) > limits.importBytes) throw new AppError("file_too_large");
  const { entries, skipped } = expand(input.files);
  const byPath = new Map(entries.map(e => [e.name, e]));
  const assetsByKey = new Map(entries.filter(e => !pageExtensions.test(e.name)).map(e => [e.name.split("/").map(stripId).join("/").toLowerCase(), e]));

  // The pages: each Markdown file, and each folder that holds some without
  // a file of its own (it becomes an empty page, their parent).
  const planned = new Map<string, Planned>();
  for (const e of entries.filter(x => pageExtensions.test(x.name))) {
    if (e.data.byteLength > limits.importFile) {
      skipped.push(e.name.split("/").at(-1)!);
      continue;
    }
    const key = keyOf(e.name);
    const parts = key.split("/");
    const parent = parts.length > 1 ? parts.slice(0, -1).join("/") : null;
    let doc = fromMarkdown(new TextDecoder().decode(e.data));
    const lead = takeTitle(doc);
    doc = lead.doc;
    planned.set(key, { key, path: e.name, title: lead.title ?? titleOf(e.name), parent, doc });
  }
  // The folders above them. A lone top folder (the zip's own name) is not a page.
  for (const p of [...planned.values()]) {
    let parent = p.parent;
    const raw = p.path!.split("/");
    let depth = raw.length - 1;
    while (parent !== null && !planned.has(parent)) {
      const parts = parent.split("/");
      planned.set(parent, { key: parent, path: null, title: stripId(raw[depth - 1] ?? parts.at(-1)!).trim(), parent: parts.length > 1 ? parts.slice(0, -1).join("/") : null, doc: null });
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

  // Parents before children; by title among siblings.
  const depthOf = (p: Planned): number => (p.parent === null ? 0 : 1 + depthOf(planned.get(p.parent)!));
  const order = [...planned.values()].sort((a, b) => depthOf(a) - depthOf(b) || a.title.localeCompare(b.title));
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
        const title = clean(p.title || input.untitled, limits.title);
        const [row] = await tx<{ id: string }[]>`
          insert into pages (space_id, parent_id, position, title, doc, version, created_by, updated_by)
          values (${s.id}, ${parentId}, ${position}, ${title}, ${tx.json(json({ type: "doc", content: [{ type: "paragraph" }] }))}, 0, ${actor!.id}, ${actor!.id}) returning id`;
        p.id = String(row!.id);
        p.title = title;
      }
      // Then their content, with links and files made local.
      for (const p of order) {
        const source = p.doc ?? { type: "doc" as const, content: [{ type: "paragraph" }] };
        const asset = async (href: string): Promise<string | null> => {
          const path = resolve(p.path ?? "", href);
          if (path === null) return null;
          const entry = byPath.get(path) ?? assetsByKey.get(path.split("/").map(stripId).join("/").toLowerCase());
          if (!entry) return null;
          const ext = extOf(entry.name);
          const type = fileTypes[ext] ?? "application/octet-stream";
          if (entry.data.byteLength > limits.fileSize) return null;
          const object = `${folderOf(p.id!)}${randomBytes(10).toString("hex")}.${ext || "bin"}`;
          try {
            await chestFiles.put(object, entry.data, type);
          } catch (error) {
            if (error instanceof ChestError) return null;
            throw error;
          }
          uploaded.push(object);
          used.add(entry.name);
          const saved = await attach(tx, actor, p.id, { object, fileName: stripId(entry.name.split("/").at(-1)!), type, size: entry.data.byteLength });
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
        await writeContent(tx, p.id!, actor!.id, { title: p.title, doc, kind: "imported" });
      }
      return { spaceId: s.id, firstPageId: order.find(p => p.parent === null)?.id ?? null, pages: order.length };
    });
    // Files no page pointed to (a Notion database's CSV…) did not come.
    for (const e of entries) if (!pageExtensions.test(e.name) && !used.has(e.name)) skipped.push(e.name.split("/").at(-1)!);
    return { ...result, files, skipped: { files: skipped, images } };
  } catch (error) {
    for (const object of uploaded) await chestFiles.delete(object).catch(() => false);
    // A space made for this import goes with it.
    if (!target) await sql`delete from spaces where id = ${s.id} and not exists (select 1 from pages where space_id = ${s.id})`;
    throw error;
  }
}
