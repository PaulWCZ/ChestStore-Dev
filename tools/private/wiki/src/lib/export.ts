import type { Member } from "@argentic/chest-sdk/member";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as chestFiles from "@argentic/chest-sdk/files";
import type { Query } from "./db.ts";
import { references } from "./doc.ts";
import { AppError } from "./errors.ts";
import { fileOf, type PageFile } from "./files.ts";
import { toMarkdown } from "./markdown.ts";
import { page, titles, tree, type TreeNode } from "./pages.ts";
import { escapeHtml, render } from "./render.ts";
import { listSpaces, space } from "./spaces.ts";
import { zipStream, type ZipEntry } from "@argentic/chest-app";

// Exports: nothing written in the wiki is locked in. A page as Markdown or
// as a web page of its own (its images inside, ready to print or archive);
// a page with its subpages, or a whole space, as a zip of Markdown files in
// folders, with their images and files. Links between exported pages stay
// links between the files; other links point back to the wiki.

const embedLimit = 20 << 20;
// A zip is written as it is read (the package's zipStream): its files are
// fetched from the Chest one at a time, never the whole archive in memory.
// Its size is bounded by the zip format without ZIP64 (4 GiB): the files
// stop at 3 GiB, pages link to the rest on the wiki.
const zipFilesLimit = 3 * 1024 ** 3;

// A title as a file name on any system.
export function fileNameOf(title: string): string {
  const name = title.normalize("NFC").replace(/[\\/:*?"<>|\p{Cc}]+/gu, " ").replace(/\s+/gu, " ").replace(/^[.\s]+|[.\s]+$/gu, "").slice(0, 80);
  return name || "page";
}

type Words = { missing: string };


export async function pageMarkdown(sql: Query, actor: Member | null, pageId: unknown, origin: string, words: Words): Promise<{ name: string; text: string }> {
  const p = await page(sql, actor, pageId);
  const known = await titles(sql, actor, p.doc);
  const text = `# ${p.title}\n\n` + toMarkdown(p.doc, {
    title: i => known.get(i),
    pageHref: (i, anchor) => `${origin}/chest/pages/${i}${anchor}`,
    fileHref: i => `${origin}/chest/files/${i}`,
    missing: words.missing,
  });
  return { name: fileNameOf(p.title) + ".md", text };
}

// fileData reads a file's bytes from the Chest, or null when it cannot.
async function fileData(f: PageFile): Promise<Uint8Array | null> {
  try {
    return (await chestFiles.get(f.object))?.data ?? null;
  } catch (error) {
    if (error instanceof ChestError) return null;
    throw error;
  }
}

export const printStyle = `
  :root { color-scheme: light; }
  body { margin: 0; background: #fbf8f1; color: #23201a; font: 18px/1.65 "Newsreader", Georgia, "Times New Roman", serif; }
  main { max-width: 68ch; margin: 0 auto; padding: 48px 24px 96px; }
  h1 { font-size: 2.4em; line-height: 1.15; margin: 0 0 0.6em; font-weight: 600; }
  h2 { font-size: 1.55em; margin: 1.6em 0 0.4em; line-height: 1.25; font-weight: 600; }
  h3 { font-size: 1.25em; margin: 1.4em 0 0.3em; font-weight: 600; }
  h4 { font-size: 1.05em; margin: 1.2em 0 0.2em; text-transform: uppercase; letter-spacing: 0.06em; }
  p, ul, ol, blockquote, pre, figure, .table-wrap, aside { margin: 0 0 1em; }
  a { color: #1d5b43; }
  blockquote { border-left: 3px solid #1d5b43; padding-left: 1em; font-style: italic; color: #4a453b; }
  aside { background: #eef3ec; border-radius: 8px; padding: 0.8em 1em; }
  aside.warning { background: #fbf0dc; } aside.tip { background: #eaf1f8; }
  code { font: 0.85em ui-monospace, Menlo, Consolas, monospace; background: #f0ebe0; padding: 0.1em 0.3em; border-radius: 4px; }
  pre { background: #f0ebe0; padding: 1em; border-radius: 8px; overflow-x: auto; } pre code { background: none; padding: 0; }
  table { border-collapse: collapse; width: 100%; font-size: 0.9em; } th, td { border: 1px solid #d9d1c1; padding: 0.4em 0.6em; text-align: left; vertical-align: top; } th { background: #f0ebe0; }
  img { max-width: 100%; height: auto; } figcaption { font-size: 0.85em; color: #5f594d; }
  ul.tasks { list-style: none; padding-left: 0.2em; } ul.tasks li { display: flex; gap: 0.5em; } ul.tasks li.done div { text-decoration: line-through; color: #6b6558; }
  hr { border: 0; border-top: 1px solid #d9d1c1; margin: 2em 0; }
  .meta { color: #5f594d; font: 14px/1.4 system-ui, sans-serif; margin-bottom: 2em; }
  @media print { body { background: none; font-size: 12pt; } main { padding: 0; max-width: none; } a { color: inherit; } }
`;

export async function pageHtml(sql: Query, actor: Member | null, pageId: unknown, origin: string, words: Words & { lang: string; meta: string }): Promise<{ name: string; html: string }> {
  const p = await page(sql, actor, pageId);
  const known = await titles(sql, actor, p.doc);
  // The page's images, inside the file (up to 20 MiB), so that it opens
  // anywhere, offline.
  const embedded = new Map<string, string>();
  let total = 0;
  for (const fileId of references(p.doc).files) {
    const f = await fileOf(sql, actor, fileId).catch(() => null);
    if (!f || !f.image || total + f.size > embedLimit) continue;
    const data = await fileData(f);
    if (!data) continue;
    total += data.byteLength;
    embedded.set(fileId, `data:${f.type};base64,${Buffer.from(data).toString("base64")}`);
  }
  const { html } = render(p.doc, {
    title: i => known.get(i),
    missing: words.missing,
    pageHref: (i, anchor) => `${origin}/chest/pages/${i}${anchor}`,
    fileHref: (i, download) => (!download && embedded.get(i)) || `${origin}/chest/files/${i}${download ? "?download" : ""}`,
  });
  const document = `<!doctype html>
<html lang="${escapeHtml(words.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(p.title)}</title>
<style>${printStyle}</style>
</head>
<body>
<main>
<h1>${escapeHtml(p.title)}</h1>
<p class="meta">${escapeHtml(words.meta)}</p>
${html}
</main>
</body>
</html>
`;
  return { name: fileNameOf(p.title) + ".html", html: document };
}

// The zip of a branch (a page and its subpages), of a whole space, or of
// every space the actor sees (a folder each: a backup, or leaving). What
// may be exported is decided before the answer starts (a page or space the
// actor cannot see is not_found); the archive itself is a stream, a page
// and its files at a time.
export async function exportZip(sql: Query, actor: Member | null, what: { pageId?: unknown; spaceId?: unknown; all?: string }, origin: string, words: Words): Promise<{ name: string; stream: ReadableStream<Uint8Array> }> {
  let nodes: TreeNode[];
  let name: string;
  // Every space: each its own top folder.
  const folders = new Map<string, string>();
  if (what.all !== undefined) {
    const seen = new Set<string>();
    const all = await listSpaces(sql, actor);
    for (const s of all) {
      let folder = fileNameOf(s.name);
      for (let k = 2; seen.has(folder.toLowerCase()); k++) folder = `${fileNameOf(s.name)} (${k})`;
      seen.add(folder.toLowerCase());
      folders.set(s.id, folder);
    }
    nodes = await tree(sql, actor, all.map(s => s.id));
    name = fileNameOf(what.all);
  } else if (what.pageId !== undefined) {
    const p = await page(sql, actor, what.pageId);
    const all = await tree(sql, actor, [p.spaceId]);
    const inside = new Set([p.id]);
    // Parents come before children in the tree's order? Not always: loop until stable.
    for (let grew = true; grew; ) {
      grew = false;
      for (const n of all) if (n.parentId && inside.has(n.parentId) && !inside.has(n.id)) { inside.add(n.id); grew = true; }
    }
    nodes = all.filter(n => inside.has(n.id)).map(n => (n.id === p.id ? { ...n, parentId: null } : n));
    name = fileNameOf(p.title);
  } else {
    const s = await space(sql, actor, what.spaceId);
    nodes = await tree(sql, actor, [s.id]);
    name = fileNameOf(s.name);
  }
  if (nodes.length === 0) throw new AppError("import_empty");
  // Each page's path: "Title.md", its subpages in the folder "Title/".
  const byId = new Map(nodes.map(n => [n.id, n]));
  const paths = new Map<string, string>();
  const used = new Set<string>();
  const pathOf = (n: TreeNode): string => {
    const known = paths.get(n.id);
    if (known) return known;
    const parent = n.parentId && byId.has(n.parentId) ? pathOf(byId.get(n.parentId)!) + "/" : folders.has(n.spaceId) ? folders.get(n.spaceId)! + "/" : "";
    const base = parent + fileNameOf(n.title);
    let candidate = base;
    for (let k = 2; used.has(candidate.toLowerCase()); k++) candidate = `${base} (${k})`;
    used.add(candidate.toLowerCase());
    paths.set(n.id, candidate);
    return candidate;
  };
  for (const n of nodes) pathOf(n);
  const relative = (from: string, to: string): string => {
    const a = from.split("/").slice(0, -1);
    const b = to.split("/");
    let k = 0;
    while (k < a.length && k < b.length - 1 && a[k] === b[k]) k++;
    return [...a.slice(k).map(() => ".."), ...b.slice(k)].map(encodeURIComponent).join("/");
  };
  const included = new Map<string, string>();
  async function* entries(): AsyncGenerator<ZipEntry> {
    let total = 0;
    for (const n of nodes) {
      // A page deleted or moved out of reach since: left out.
      const p = await page(sql, actor, n.id).catch(error => {
        if (error instanceof AppError) return null;
        throw error;
      });
      if (!p) continue;
      const known = await titles(sql, actor, p.doc);
      const own = paths.get(n.id)! + ".md";
      for (const fileId of references(p.doc).files) {
        if (included.has(fileId)) continue;
        const f = await fileOf(sql, actor, fileId).catch(() => null);
        if (!f || total + f.size > zipFilesLimit) continue;
        const data = await fileData(f);
        if (!data) continue;
        total += data.byteLength;
        const path = `files/${f.id}-${fileNameOf(f.fileName)}`;
        included.set(fileId, path);
        yield { name: path, data };
      }
      const text = `# ${p.title}\n\n` + toMarkdown(p.doc, {
        title: i => known.get(i),
        pageHref: (i, anchor) => (paths.has(i) ? relative(own, paths.get(i)! + ".md") + anchor : `${origin}/chest/pages/${i}${anchor}`),
        fileHref: i => (included.has(i) ? relative(own, included.get(i)!) : `${origin}/chest/files/${i}`),
        missing: words.missing,
      });
      yield { name: own, data: text };
    }
  }
  return { name: name + ".zip", stream: zipStream(entries()) };
}
