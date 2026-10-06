import type { Member } from "@argentic/chest-sdk/member";
import { json, type Query, type Sql } from "./db.ts";
import { emptyDoc, normalize, plainText, references, type Doc } from "./doc.ts";
import { AppError } from "./errors.ts";
import { clean, id, isId, limits } from "./model.ts";
import { between } from "./position.ts";
import { listSpaces, space, type Space } from "./spaces.ts";

// Pages: a tree in each space. Reading, creating, arranging, the trash.
// Writing a page's content goes through lib/editing.ts (the edit lock and
// drafts); its versions through lib/history.ts.

export type TreeNode = { id: string; spaceId: string; parentId: string | null; title: string; position: string };

export type Page = {
  id: string;
  spaceId: string;
  parentId: string | null;
  title: string;
  doc: Doc;
  version: number;
  createdBy: string;
  createdAt: Date;
  updatedBy: string;
  updatedAt: Date;
  deleted: boolean;
  space: Space;
  // Offered as a model for new pages of its space.
  template: boolean;
  // Checked every few months (lib/reviews.ts), or null.
  review: Review | null;
};

export type Review = { months: number; owner: string | null; reviewedAt: Date; due: boolean };

type PageRow = { id: string; space_id: string; parent_id: string | null; title: string; doc: unknown; version: number; created_by: string; created_at: Date; updated_by: string; updated_at: Date; deleted_at: Date | null; template: boolean; review_months: number | null; review_owner: string | null; reviewed_at: Date | null; review_due: boolean };

// The trees of the spaces the actor sees: ids, titles and places only
// (the sidebar, the page pickers, the titles of links).
export async function tree(sql: Query, actor: Member | null, spaceIds?: string[]): Promise<TreeNode[]> {
  const ids = spaceIds ?? (await listSpaces(sql, actor)).map(s => s.id);
  if (ids.length === 0) return [];
  const found = await sql<{ id: string; space_id: string; parent_id: string | null; title: string; position: string }[]>`
    select id, space_id, parent_id, title, position from pages
    where deleted_at is null and space_id in ${sql(ids)}
    order by space_id, parent_id nulls first, position, id limit ${limits.pages}`;
  return found.map(r => ({ id: String(r.id), spaceId: String(r.space_id), parentId: r.parent_id === null ? null : String(r.parent_id), title: r.title, position: r.position }));
}

// The tree as a sidebar shows it: the top pages of each space and the
// branch of the page being read (its ancestors' pages, its own), each node
// saying whether it holds more (`more`: its pages come when it is opened,
// branchOf). A wiki of thousands of pages is not sent on every page.
export type ShownNode = { id: string; spaceId: string; parentId: string | null; title: string; more: boolean };
export function shownTree(nodes: TreeNode[], current: string | null, all = false): ShownNode[] {
  const parents = new Set(nodes.map(n => n.parentId).filter((p): p is string => p !== null));
  const byId = new Map(nodes.map(n => [n.id, n]));
  const open = new Set<string>();
  for (let n = current ? byId.get(current) : undefined; n; n = n.parentId ? byId.get(n.parentId) : undefined) open.add(n.id);
  return nodes.filter(n => all || n.parentId === null || open.has(n.parentId)).map(n => ({ id: n.id, spaceId: n.spaceId, parentId: n.parentId, title: n.title, more: parents.has(n.id) }));
}

// branchOf: the pages right inside a page the actor reads, as shownTree
// writes them.
export async function branchOf(sql: Query, actor: Member | null, pageId: unknown): Promise<ShownNode[]> {
  const p = await page(sql, actor, pageId);
  const nodes = await tree(sql, actor, [p.spaceId]);
  const parents = new Set(nodes.map(n => n.parentId).filter((x): x is string => x !== null));
  return nodes.filter(n => n.parentId === p.id).map(n => ({ id: n.id, spaceId: n.spaceId, parentId: n.parentId, title: n.title, more: parents.has(n.id) }));
}

// pageStamp: a short mark of what a reader of the page sees changing — its
// version, title, pins and flags, its comments, its lock, the reader's own
// draft and confirmation: the page re-reads itself only when it changed.
export async function pageStamp(sql: Query, actor: Member | null, pageId: unknown): Promise<string> {
  const p = await page(sql, actor, pageId);
  const [row] = await sql<{ stamp: string }[]>`
    select md5(concat_ws('|', p.version, p.title, p.updated_at, p.pinned_at, p.template, p.reviewed_at, p.review_months, p.read_asked_at, p.parent_id, p.space_id,
      (select concat(count(*), ':', max(greatest(created_at, edited_at, removed_at, resolved_at))) from page_comments where page_id = p.id),
      (select concat(member_id, ':', since) from page_locks where page_id = p.id),
      (select updated_at from drafts where page_id = p.id and member_id = ${actor!.id}),
      (select concat(version, ':', read_at) from page_reads where page_id = p.id and member_id = ${actor!.id}))) as stamp
    from pages p where p.id = ${p.id}`;
  return row?.stamp ?? "";
}

// page reads one page as the actor may see it. A page in the trash is only
// read by who may restore it.
export async function page(sql: Query, actor: Member | null, pageId: unknown, needed: "read" | "write" = "read", options: { deleted?: boolean } = {}): Promise<Page> {
  const key = id(pageId);
  const [row] = await sql<PageRow[]>`
    select id, space_id, parent_id, title, doc, version, created_by, created_at, updated_by, updated_at, deleted_at, template,
      review_months, review_owner, reviewed_at, coalesce(reviewed_at + make_interval(months => review_months) <= now(), false) as review_due
    from pages where id = ${key}`;
  if (!row) throw new AppError("not_found");
  const s = await space(sql, actor, String(row.space_id));
  if (row.deleted_at !== null && (!options.deleted || s.access !== "write")) throw new AppError("not_found");
  if (needed === "write" && s.access !== "write") throw new AppError("forbidden");
  return {
    id: String(row.id),
    spaceId: String(row.space_id),
    parentId: row.parent_id === null ? null : String(row.parent_id),
    title: row.title,
    doc: normalize(row.doc),
    version: row.version,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
    deleted: row.deleted_at !== null,
    space: s,
    template: row.template,
    review: row.review_months !== null && row.reviewed_at !== null ? { months: row.review_months, owner: row.review_owner, reviewedAt: row.reviewed_at, due: row.review_due } : null,
  };
}

// The pages above one, from the space's top.
export async function ancestors(sql: Query, pageId: string): Promise<{ id: string; title: string }[]> {
  const found = await sql<{ id: string; title: string; depth: number }[]>`
    with recursive up (id, parent_id, title, depth) as (
      select id, parent_id, title, 0 from pages where id = ${pageId}
      union all
      select p.id, p.parent_id, p.title, up.depth + 1 from pages p join up on p.id = up.parent_id where up.depth < 64
    )
    select id, title, depth from up where depth > 0 order by depth desc`;
  return found.map(r => ({ id: String(r.id), title: r.title }));
}

async function depthOf(sql: Query, pageId: string | null): Promise<number> {
  if (pageId === null) return 0;
  return (await ancestors(sql, pageId)).length + 1;
}

// place computes the position of a page among its new siblings: at index
// (null: last).
async function place(sql: Query, spaceId: string, parentId: string | null, index: number | null, except: string | null): Promise<string> {
  const siblings = await sql<{ id: string; position: string }[]>`
    select id, position from pages
    where space_id = ${spaceId} and deleted_at is null and ${parentId === null ? sql`parent_id is null` : sql`parent_id = ${parentId}`}
    ${except ? sql`and id <> ${except}` : sql``}
    order by position, id`;
  const at = index === null ? siblings.length : Math.min(Math.max(index, 0), siblings.length);
  const low = siblings[at - 1]?.position ?? null;
  const high = siblings[at]?.position ?? null;
  // Two siblings with the same position (never written by us): start again after them.
  return low !== null && high !== null && low >= high ? between(low, null) : between(low, high);
}

async function checkParent(sql: Query, actor: Member | null, spaceId: string, parent: unknown): Promise<string | null> {
  if (parent === null || parent === undefined || parent === "") return null;
  const p = await page(sql, actor, parent, "write");
  if (p.spaceId !== spaceId) throw new AppError("invalid");
  return p.id;
}

// createPage adds a page (version 1) in a space, under a page or at the
// top, at the end: empty, or with a starting document (a template's,
// already normalized by the caller).
export async function createPage(sql: Sql, actor: Member | null, input: { spaceId: unknown; parentId?: unknown; title: unknown; doc?: Doc }): Promise<{ id: string }> {
  const s = await space(sql, actor, input.spaceId, "write");
  const title = clean(input.title, limits.title);
  const parentId = await checkParent(sql, actor, s.id, input.parentId);
  if ((await depthOf(sql, parentId)) >= limits.depth) throw new AppError("too_many", { max: limits.depth });
  const [count] = await sql<{ n: number }[]>`select count(*)::int as n from pages`;
  if ((count?.n ?? 0) >= limits.pages) throw new AppError("too_many", { max: limits.pages });
  const doc = input.doc ?? emptyDoc();
  return sql.begin(async tx => {
    const position = await place(tx, s.id, parentId, null, null);
    const [row] = await tx<{ id: string }[]>`
      insert into pages (space_id, parent_id, position, title, doc, body, created_by, updated_by)
      values (${s.id}, ${parentId}, ${position}, ${title}, ${tx.json(json(doc))}, '', ${actor!.id}, ${actor!.id}) returning id`;
    const pageId = String(row!.id);
    const { body, targets } = await derive(tx, pageId, doc);
    if (body !== "") await tx`update pages set body = ${body} where id = ${pageId}`;
    await tx`insert into page_versions (page_id, number, title, doc, body, author, kind) values (${pageId}, 1, ${title}, ${tx.json(json(doc))}, ${body}, ${actor!.id}, 'created')`;
    for (const t of targets) await tx`insert into page_links (from_page, to_page) values (${pageId}, ${t}) on conflict do nothing`;
    return { id: pageId };
  });
}

// derive gives what a page's document means for the rest of the wiki: its
// words for search — naming the pages it links to, only those whose title
// its own readers may see (its space, or an open one) — and the pages it
// links to.
async function derive(tx: Query, pageId: string, doc: Doc): Promise<{ body: string; targets: string[] }> {
  const linked = await tx<{ id: string; title: string; shown: boolean }[]>`
    select p.id, p.title, (p.space_id = here.space_id or s.visibility = 'everyone') as shown
    from pages p join spaces s on s.id = p.space_id, (select space_id from pages where id = ${pageId}) here
    where p.id in ${tx(references(doc).pages.concat(["0"]))}`;
  const shown = new Map(linked.filter(r => r.shown).map(r => [String(r.id), r.title]));
  return { body: plainText(doc, i => shown.get(i)), targets: linked.map(r => String(r.id)).filter(t => t !== pageId) };
}

// writeContent stores a new version of a page (a save, a restore, an
// import) and the links it holds. The caller checked the rights.
// at: when this content was written (an import keeps the date the page
// had where it came from); now otherwise.
export async function writeContent(tx: Query, pageId: string, author: string, input: { title: string; doc: Doc; kind: "edited" | "restored" | "imported"; restoredFrom?: number; at?: Date }): Promise<number> {
  const { body, targets } = await derive(tx, pageId, input.doc);
  const at = input.at ?? null;
  const [row] = await tx<{ version: number }[]>`
    update pages set title = ${input.title}, doc = ${tx.json(json(input.doc))}, body = ${body}, version = version + 1, updated_by = ${author}, updated_at = coalesce(${at}::timestamptz, now())
    where id = ${pageId} returning version`;
  const version = row!.version;
  await tx`insert into page_versions (page_id, number, title, doc, body, author, kind, restored_from, created_at) values (${pageId}, ${version}, ${input.title}, ${tx.json(json(input.doc))}, ${body}, ${author}, ${input.kind}, ${input.restoredFrom ?? null}, coalesce(${at}::timestamptz, now()))`;
  await tx`delete from page_links where from_page = ${pageId}`;
  for (const t of targets) await tx`insert into page_links (from_page, to_page) values (${pageId}, ${t}) on conflict do nothing`;
  return version;
}

// movePage puts a page (with its subpages) under another page or at the
// top of a space, at an index among its new siblings (null: last).
export async function movePage(sql: Sql, actor: Member | null, pageId: unknown, input: { spaceId: unknown; parentId?: unknown; index?: unknown }): Promise<void> {
  const p = await page(sql, actor, pageId, "write");
  const target = await space(sql, actor, input.spaceId, "write");
  // A page of a shared space never goes into someone's "My pages" (it
  // would vanish for everyone else); a private page moves out to share it.
  if (target.visibility === "private" && p.space.visibility !== "private") throw new AppError("forbidden");
  const parentId = await checkParent(sql, actor, target.id, input.parentId);
  const index = typeof input.index === "number" && Number.isInteger(input.index) ? input.index : null;
  if (parentId !== null) {
    // Never under itself or one of its own subpages.
    if (parentId === p.id || (await ancestors(sql, parentId)).some(a => a.id === p.id)) throw new AppError("cycle");
  }
  const [height] = await sql<{ h: number }[]>`
    with recursive down (id, depth) as (select id, 0 from pages where id = ${p.id} union all select c.id, d.depth + 1 from pages c join down d on c.parent_id = d.id where d.depth < 64)
    select max(depth)::int as h from down`;
  if ((await depthOf(sql, parentId)) + (height?.h ?? 0) >= limits.depth) throw new AppError("too_many", { max: limits.depth });
  await sql.begin(async tx => {
    const position = await place(tx, target.id, parentId, index, p.id);
    await tx`update pages set parent_id = ${parentId}, space_id = ${target.id}, position = ${position} where id = ${p.id}`;
    if (target.id !== p.spaceId) {
      await tx`
        with recursive down (id) as (select id from pages where parent_id = ${p.id} union all select c.id from pages c join down d on c.parent_id = d.id)
        update pages set space_id = ${target.id} where id in (select id from down)`;
    }
  });
}

// deletePage puts a page and its subpages in the trash; restorePage takes
// them out (back under their parent, or at the top if it is in the trash
// too); purgePage deletes them for good, with their history — the Chest
// objects of their files are answered, for the caller to remove.
export async function deletePage(sql: Sql, actor: Member | null, pageId: unknown): Promise<{ pages: number; ids: string[] }> {
  const p = await page(sql, actor, pageId, "write");
  const done = await sql`
    with recursive down (id) as (select ${p.id}::bigint union all select c.id from pages c join down d on c.parent_id = d.id where c.deleted_at is null)
    update pages set deleted_at = now() where id in (select id from down) and deleted_at is null returning id`;
  const ids = done.map(r => String(r["id"]));
  await sql`delete from page_locks where page_id in ${sql(ids)}`;
  return { pages: done.length, ids };
}

export async function restorePage(sql: Sql, actor: Member | null, pageId: unknown): Promise<void> {
  const p = await page(sql, actor, pageId, "write", { deleted: true });
  if (!p.deleted) return;
  await sql.begin(async tx => {
    const parentGone = p.parentId !== null && (await tx`select 1 from pages where id = ${p.parentId} and deleted_at is null`).length === 0;
    if (parentGone) await tx`update pages set parent_id = null, position = ${await place(tx, p.spaceId, null, null, p.id)} where id = ${p.id}`;
    await tx`
      with recursive down (id) as (select ${p.id}::bigint union all select c.id from pages c join down d on c.parent_id = d.id)
      update pages set deleted_at = null where id in (select id from down) and deleted_at = (select deleted_at from pages where id = ${p.id})`;
  });
}

export async function purgePage(sql: Sql, actor: Member | null, pageId: unknown): Promise<{ objects: string[] }> {
  const p = await page(sql, actor, pageId, "write", { deleted: true });
  if (!p.deleted) throw new AppError("invalid");
  return sql.begin(async tx => {
    const objects = await tx<{ object: string }[]>`
      with recursive down (id) as (select ${p.id}::bigint union all select c.id from pages c join down d on c.parent_id = d.id)
      select f.object from page_files f where f.page_id in (select id from down)`;
    await tx`delete from pages where id = ${p.id}`;
    return { objects: objects.map(o => o.object) };
  });
}

// excerpt: the page's first sentences — its paragraphs, not its headings
// (short lines without a full stop) nor its tables.
export function excerpt(body: string, max = 220): string {
  const kept = body.split("\n").map(l => l.trim()).filter(l => !l.includes("│") && (l.length >= 60 || /[.!?:…]$/u.test(l)));
  const text = kept.join(" ").replace(/\s+/gu, " ").trim();
  return [...text].length <= max ? text : [...text].slice(0, max - 1).join("").replace(/\s+\S*$/u, "") + "…";
}

export type Listed = { id: string; title: string; spaceId: string; spaceName: string; updatedBy: string; updatedAt: Date; excerpt: string };

// The pages most recently changed, in the spaces the actor sees; for the
// home's "Recently updated", withoutImports leaves out those only imported
// since (a migration of 300 pages would hide the real changes for weeks):
// a page shows there once someone saves it here.
export async function recent(sql: Query, actor: Member | null, options: { spaceId?: string; limit?: number; withoutImports?: boolean } = {}): Promise<Listed[]> {
  const spaces = await listSpaces(sql, actor);
  const ids = options.spaceId ? spaces.filter(s => s.id === options.spaceId).map(s => s.id) : spaces.map(s => s.id);
  if (ids.length === 0) return [];
  const names = new Map(spaces.map(s => [s.id, s.name]));
  const found = await sql<{ id: string; title: string; space_id: string; updated_by: string; updated_at: Date; excerpt: string }[]>`
    select id, title, space_id, updated_by, updated_at, left(body, 1500) as excerpt from pages
    where deleted_at is null and space_id in ${sql(ids)}
      and ${options.withoutImports ? sql`not exists (select 1 from page_versions v where v.page_id = pages.id and v.number = pages.version and v.kind = 'imported')` : sql`true`}
    order by updated_at desc, id desc limit ${Math.min(options.limit ?? 12, 50)}`;
  return found.map(r => ({ id: String(r.id), title: r.title, spaceId: String(r.space_id), spaceName: names.get(String(r.space_id)) ?? "", updatedBy: r.updated_by, updatedAt: r.updated_at, excerpt: excerpt(r.excerpt) }));
}

// The trash: pages deleted (the top of each deleted branch), in the spaces
// the actor may write in.
export async function trash(sql: Query, actor: Member | null): Promise<{ id: string; title: string; spaceName: string; deletedAt: Date; updatedBy: string; below: number }[]> {
  const spaces = (await listSpaces(sql, actor)).filter(s => s.access === "write");
  if (spaces.length === 0) return [];
  const names = new Map(spaces.map(s => [s.id, s.name]));
  const found = await sql<{ id: string; title: string; space_id: string; deleted_at: Date; updated_by: string; below: number }[]>`
    select p.id, p.title, p.space_id, p.deleted_at, p.updated_by,
      (select count(*)::int from pages c where c.parent_id = p.id and c.deleted_at = p.deleted_at) as below
    from pages p left join pages up on up.id = p.parent_id
    where p.deleted_at is not null and p.space_id in ${sql(spaces.map(s => s.id))}
      and (up.id is null or up.deleted_at is null or up.deleted_at <> p.deleted_at)
    order by p.deleted_at desc limit 200`;
  return found.map(r => ({ id: String(r.id), title: r.title, spaceName: names.get(String(r.space_id)) ?? "", deletedAt: r.deleted_at, updatedBy: r.updated_by, below: r.below }));
}

// The pages that link to this one, among those the actor sees.
export async function backlinks(sql: Query, actor: Member | null, pageId: string): Promise<{ id: string; title: string }[]> {
  const ids = (await listSpaces(sql, actor)).map(s => s.id);
  if (ids.length === 0) return [];
  const found = await sql<{ id: string; title: string }[]>`
    select p.id, p.title from page_links l join pages p on p.id = l.from_page
    where l.to_page = ${pageId} and p.deleted_at is null and p.space_id in ${sql(ids)}
    order by p.title limit 50`;
  return found.map(r => ({ id: String(r.id), title: r.title }));
}

// titles gives the current title of the pages a document points to, those
// the actor sees (the others read as gone).
export async function titles(sql: Query, actor: Member | null, doc: Doc): Promise<Map<string, string>> {
  const wanted = references(doc).pages.filter(isId);
  if (wanted.length === 0) return new Map();
  const ids = (await listSpaces(sql, actor)).map(s => s.id);
  if (ids.length === 0) return new Map();
  const found = await sql<{ id: string; title: string }[]>`select id, title from pages where id in ${sql(wanted)} and deleted_at is null and space_id in ${sql(ids)}`;
  return new Map(found.map(r => [String(r.id), r.title]));
}
