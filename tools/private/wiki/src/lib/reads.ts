import type { Member } from "@argentic/chest-sdk/member";
import { spaceAccess } from "./access.ts";
import type { Query, Sql } from "./db.ts";
import { AppError } from "./errors.ts";
import { membersOfTool } from "./groups.ts";
import { groupIds } from "./model.ts";
import { page, type Page } from "./pages.ts";
import { listSpaces } from "./spaces.ts";

// "Read and acknowledged": an editor asks the readers of a page — everyone
// who reads its space, or the members of some groups — to confirm they
// read it (the company's rules, a safety instruction). Each is told once in
// the bell (lib/tell.ts, key read:<page>) and sees "I have read it" on the
// page; the editors see who confirmed which version, and can download it
// as a table. Asking again after a change asks about the new version:
// earlier confirmations stay, marked as of an older version.

export type ReadAsk = { at: Date; by: string | null; version: number; groups: string[] };
export type ReadState = { asked: ReadAsk | null; mine: { version: number; at: Date } | null; concerned: boolean };

type AskRow = { read_asked_at: Date | null; read_asked_by: string | null; read_version: number | null; read_groups: string[] };

async function askOf(sql: Query, pageId: string): Promise<ReadAsk | null> {
  const [row] = await sql<AskRow[]>`select read_asked_at, read_asked_by, read_version, read_groups from pages where id = ${pageId}`;
  return row?.read_asked_at && row.read_version !== null ? { at: row.read_asked_at, by: row.read_asked_by, version: row.read_version, groups: row.read_groups ?? [] } : null;
}

// Whether a member is among those asked (they read the page: checked by
// the caller). Whoever asks is not asked.
export const concerns = (ask: ReadAsk, who: { id: string; groups: string[] }): boolean => who.id !== ask.by && (ask.groups.length === 0 || ask.groups.some(g => who.groups.includes(g)));

export async function readState(sql: Query, actor: Member | null, pageId: unknown): Promise<ReadState> {
  const p = await page(sql, actor, pageId);
  const asked = await askOf(sql, p.id);
  const [mine] = await sql<{ version: number; read_at: Date }[]>`select version, read_at from page_reads where page_id = ${p.id} and member_id = ${actor!.id}`;
  return { asked, mine: mine ? { version: mine.version, at: mine.read_at } : null, concerned: asked !== null && concerns(asked, actor!) };
}

// ask: the page's editors ask for confirmations of its current version
// (again, after a change), from everyone who reads its space or from the
// members of some groups.
export async function ask(sql: Sql, actor: Member | null, pageId: unknown, input: { groups?: unknown } = {}): Promise<Page> {
  const p = await page(sql, actor, pageId, "write");
  // Nobody else reads a page of "My pages": nobody to ask.
  if (p.space.visibility === "private") throw new AppError("invalid");
  // Asked again without saying whom: the same people as before.
  const groups = input.groups === undefined ? (await askOf(sql, p.id))?.groups ?? [] : groupIds(input.groups);
  await sql`update pages set read_asked_at = now(), read_asked_by = ${actor!.id}, read_version = version, read_groups = ${groups}, read_reminded_at = null, read_reminders = 0 where id = ${p.id}`;
  return p;
}

// stopAsking: nobody is asked any more; confirmations already given stay.
export async function stopAsking(sql: Sql, actor: Member | null, pageId: unknown): Promise<void> {
  const p = await page(sql, actor, pageId, "write");
  await sql`update pages set read_asked_at = null, read_asked_by = null, read_version = null, read_groups = '{}' where id = ${p.id}`;
}

// confirm: "I have read it", of the page as it is now, by whoever is asked.
export async function confirm(sql: Sql, actor: Member | null, pageId: unknown): Promise<{ version: number }> {
  const p = await page(sql, actor, pageId);
  const asked = await askOf(sql, p.id);
  if (!asked || !concerns(asked, actor!)) throw new AppError("invalid");
  await sql`
    insert into page_reads (page_id, member_id, version) values (${p.id}, ${actor!.id}, ${p.version})
    on conflict (page_id, member_id) do update set version = excluded.version, read_at = now()`;
  return { version: p.version };
}

export type ReadRow = { memberId: string; version: number | null; at: Date | null; current: boolean };

// report: for the page's editors, each person asked — who reads its space
// now (and is in its groups, if some were chosen), as the Chest lists them —
// and anyone else who confirmed, with what they confirmed: those who have
// not yet first, then older versions, then done; by name within each.
export async function report(sql: Query, actor: Member | null, pageId: unknown): Promise<{ page: Page; ask: ReadAsk; rows: ReadRow[] }> {
  const p = await page(sql, actor, pageId, "write");
  const a = await askOf(sql, p.id);
  if (!a) throw new AppError("invalid");
  const asked = (await membersOfTool()).filter(m => spaceAccess(m, p.space) !== "none" && concerns(a, m)).map(m => m.id);
  const found = await sql<{ member_id: string; version: number; read_at: Date }[]>`select member_id, version, read_at from page_reads where page_id = ${p.id}`;
  const by = new Map(found.map(r => [r.member_id, r]));
  const ids = [...asked, ...found.map(r => r.member_id).filter(id => !asked.includes(id))];
  const rows = ids.map(id => {
    const r = by.get(id);
    return { memberId: id, version: r?.version ?? null, at: r?.read_at ?? null, current: r !== undefined && r.version >= a.version };
  });
  const rank = (r: ReadRow) => (r.version === null ? 0 : r.current ? 2 : 1);
  return { page: p, ask: a, rows: rows.map((r, i) => ({ r, i })).sort((x, y) => rank(x.r) - rank(y.r) || x.i - y.i).map(x => x.r) };
}

// pending: of these people asked, those who have not confirmed the
// version asked about.
export async function pending(sql: Query, pageId: string, ask: ReadAsk, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const done = new Set((await sql<{ member_id: string }[]>`select member_id from page_reads where page_id = ${pageId} and version >= ${ask.version} and member_id in ${sql(ids)}`).map(r => r.member_id));
  return ids.filter(id => !done.has(id));
}

// A cell of a CSV file: quoted, and never read as a formula by a
// spreadsheet.
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/u.test(value) ? "'" + value : value;
  return `"${safe.replace(/"/gu, '""')}"`;
}

// The pages the actor is asked to confirm and has not (for this version):
// the home page lists them.
export async function toRead(sql: Query, actor: Member | null): Promise<{ id: string; title: string; askedAt: Date }[]> {
  if (!actor) return [];
  const spaces = (await listSpaces(sql, actor)).map(s => s.id);
  if (spaces.length === 0) return [];
  const found = await sql<{ id: string; title: string; read_asked_at: Date; read_groups: string[] }[]>`
    select p.id, p.title, p.read_asked_at, p.read_groups from pages p
    left join page_reads r on r.page_id = p.id and r.member_id = ${actor.id}
    where p.read_asked_at is not null and p.deleted_at is null and p.space_id in ${sql(spaces)}
      and (r.version is null or r.version < p.read_version) and p.read_asked_by is distinct from ${actor.id}
    order by p.read_asked_at desc limit 50`;
  return found.filter(r => (r.read_groups ?? []).length === 0 || r.read_groups.some(g => actor.groups.includes(g))).slice(0, 10)
    .map(r => ({ id: String(r.id), title: r.title, askedAt: r.read_asked_at }));
}
