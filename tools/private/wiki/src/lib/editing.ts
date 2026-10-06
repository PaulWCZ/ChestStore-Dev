import type { Member } from "@argentic/chest-sdk/member";
import { json, type Query, type Sql } from "./db.ts";
import { normalize, type Doc } from "./doc.ts";
import { AppError } from "./errors.ts";
import { clean, limits, lockIdleMinutes, lockLeaseSeconds } from "./model.ts";
import { page, writeContent } from "./pages.ts";
import { listSpaces } from "./spaces.ts";

// Editing a page, one person at a time (the Chest has no live channel for
// co-editing): opening the editor takes the page's lock; the open editor
// says so every 30 seconds (heartbeat) and gives the lock back when its tab
// closes or the person goes elsewhere (leave). A lock not heard of for two
// minutes (a crash, a laptop shut) is free again. While its holder types,
// their draft is saved every few seconds; when they have not typed for 15
// minutes, another editor may take the page over (the first one's draft
// stays theirs, nothing is lost). Saving writes a new version and gives
// the lock back.

export type Lock = { memberId: string; since: Date; activeAt: Date; idle: boolean };
export type Draft = { title: string; doc: Doc; baseVersion: number; updatedAt: Date };

// A lock still held: its editor was heard of within the lease.
const live = (sql: Query) => sql`seen_at >= now() - make_interval(secs => ${lockLeaseSeconds})`;

export async function lockOf(sql: Query, pageId: string): Promise<Lock | null> {
  const [row] = await sql<{ member_id: string; since: Date; active_at: Date; idle: boolean }[]>`
    select member_id, since, active_at, active_at < now() - make_interval(mins => ${lockIdleMinutes}) as idle
    from page_locks where page_id = ${pageId} and ${live(sql)}`;
  return row ? { memberId: row.member_id, since: row.since, activeAt: row.active_at, idle: row.idle } : null;
}

async function draftOf(sql: Query, pageId: string, memberId: string): Promise<Draft | null> {
  const [row] = await sql<{ title: string; doc: unknown; base_version: number; updated_at: Date }[]>`
    select title, doc, base_version, updated_at from drafts where page_id = ${pageId} and member_id = ${memberId}`;
  return row ? { title: row.title, doc: normalize(row.doc), baseVersion: row.base_version, updatedAt: row.updated_at } : null;
}

export type Opening =
  | { status: "editing"; draft: Draft | null; version: number }
  | { status: "locked"; lock: Lock };

// startEditing takes the page's lock for the actor: free (or left behind),
// already theirs, or — when they ask to take over — idle for long enough.
export async function startEditing(sql: Sql, actor: Member | null, pageId: unknown, options: { takeOver?: boolean } = {}): Promise<Opening> {
  const p = await page(sql, actor, pageId, "write");
  const me = actor!.id;
  const taken = await sql<{ member_id: string }[]>`
    insert into page_locks (page_id, member_id) values (${p.id}, ${me})
    on conflict (page_id) do update set
      member_id = excluded.member_id,
      since = case when page_locks.member_id = excluded.member_id then page_locks.since else now() end,
      active_at = now(),
      seen_at = now()
    where page_locks.member_id = excluded.member_id
      or page_locks.seen_at < now() - make_interval(secs => ${lockLeaseSeconds})
      or (${options.takeOver === true} and page_locks.active_at < now() - make_interval(mins => ${lockIdleMinutes}))
    returning member_id`;
  if (taken.length === 0) return { status: "locked", lock: (await lockOf(sql, p.id))! };
  return { status: "editing", draft: await draftOf(sql, p.id, me), version: p.version };
}

// saveDraft keeps what the actor typed (theirs only) and, while the lock is
// theirs, keeps it. It says who holds the lock when it is someone else.
export async function saveDraft(sql: Sql, actor: Member | null, pageId: unknown, input: { title: unknown; doc: unknown; baseVersion: unknown }): Promise<{ lock: Lock | null }> {
  const p = await page(sql, actor, pageId, "write");
  const me = actor!.id;
  const title = typeof input.title === "string" ? input.title.replace(/\p{Cc}/gu, " ").slice(0, limits.title) : "";
  const doc = normalize(input.doc);
  const base = Number.isInteger(input.baseVersion) ? Number(input.baseVersion) : p.version;
  await sql`
    insert into drafts (page_id, member_id, title, doc, base_version) values (${p.id}, ${me}, ${title}, ${sql.json(json(doc))}, ${base})
    on conflict (page_id, member_id) do update set title = excluded.title, doc = excluded.doc, base_version = excluded.base_version, updated_at = now()`;
  const kept = await sql`update page_locks set active_at = now(), seen_at = now() where page_id = ${p.id} and member_id = ${me} returning 1`;
  if (kept.length > 0) return { lock: null };
  // The lock was given back (a save elsewhere) or never held: take it if free.
  const again = await startEditing(sql, actor, p.id);
  return { lock: again.status === "locked" ? again.lock : null };
}

// heartbeat: the actor's editor is still open. It keeps their lock (without
// counting as typing), takes it again if it lapsed and nobody took it, and
// says who holds it when it is someone else.
export async function heartbeat(sql: Sql, actor: Member | null, pageId: unknown): Promise<{ lock: Lock | null }> {
  const p = await page(sql, actor, pageId, "write");
  const kept = await sql`update page_locks set seen_at = now() where page_id = ${p.id} and member_id = ${actor!.id} returning 1`;
  if (kept.length > 0) return { lock: null };
  const again = await startEditing(sql, actor, p.id);
  return { lock: again.status === "locked" ? again.lock : null };
}

// leave: the actor's editor closed without saving (a closed tab, the back
// button, another page). What they typed last is kept as their draft, when
// it came along, and the lock is given back at once.
export async function leave(sql: Sql, actor: Member | null, pageId: unknown, draft?: { title: unknown; doc: unknown; baseVersion: unknown }): Promise<void> {
  const p = await page(sql, actor, pageId, "write");
  const me = actor!.id;
  if (draft) await keepDraft(sql, actor, p.id, draft);
  await sql`delete from page_locks where page_id = ${p.id} and member_id = ${me}`;
}

// discardDraft drops the actor's unsaved changes to a page (from the page
// itself, without opening the editor) and answers them, for Undo;
// keepDraft puts them back.
export async function discardDraft(sql: Sql, actor: Member | null, pageId: unknown): Promise<{ title: string; doc: Doc; baseVersion: number } | null> {
  const p = await page(sql, actor, pageId, "write");
  const [row] = await sql<{ title: string; doc: unknown; base_version: number }[]>`
    delete from drafts where page_id = ${p.id} and member_id = ${actor!.id} returning title, doc, base_version`;
  await sql`delete from page_locks where page_id = ${p.id} and member_id = ${actor!.id}`;
  return row ? { title: row.title, doc: normalize(row.doc), baseVersion: row.base_version } : null;
}

export async function keepDraft(sql: Sql, actor: Member | null, pageId: unknown, draft: { title: unknown; doc: unknown; baseVersion: unknown }): Promise<void> {
  const p = await page(sql, actor, pageId, "write");
  const title = typeof draft.title === "string" ? draft.title.replace(/\p{Cc}/gu, " ").slice(0, limits.title) : "";
  const base = Number.isInteger(draft.baseVersion) ? Number(draft.baseVersion) : p.version;
  await sql`
    insert into drafts (page_id, member_id, title, doc, base_version) values (${p.id}, ${actor!.id}, ${title}, ${sql.json(json(normalize(draft.doc)))}, ${base})
    on conflict (page_id, member_id) do update set title = excluded.title, doc = excluded.doc, base_version = excluded.base_version, updated_at = now()`;
}

// publish saves the page as a new version, drops the actor's draft and
// gives the lock back. Refused while someone else holds the lock and is
// active. Saving nothing new writes no version. When someone saved since
// the actor started (after taking over an idle lock), their version stays
// in the history: `replaced` says whose.
export async function publish(sql: Sql, actor: Member | null, pageId: unknown, input: { title: unknown; doc: unknown; baseVersion: unknown }): Promise<{ version: number; changed: boolean; replaced: string | null; dropped: number }> {
  const p = await page(sql, actor, pageId, "write");
  const me = actor!.id;
  const title = clean(input.title, limits.title);
  // Pictures from outside the wiki are left out: the answer says how many,
  // so "Saved." never hides them (the editor turns pasted ones into notes).
  const dropped = { pictures: 0 };
  const doc = normalize(input.doc, dropped);
  const base = Number.isInteger(input.baseVersion) ? Number(input.baseVersion) : p.version;
  return sql.begin(async tx => {
    const [lock] = await tx<{ member_id: string; idle: boolean }[]>`
      select member_id, active_at < now() - make_interval(mins => ${lockIdleMinutes})
        or seen_at < now() - make_interval(secs => ${lockLeaseSeconds}) as idle
      from page_locks where page_id = ${p.id} for update`;
    if (lock && lock.member_id !== me && !lock.idle) throw new AppError("locked");
    const [current] = await tx<{ version: number; title: string; doc: unknown; updated_by: string }[]>`select version, title, doc, updated_by from pages where id = ${p.id} for update`;
    const changed = current!.title !== title || JSON.stringify(normalize(current!.doc)) !== JSON.stringify(doc);
    const version = changed ? await writeContent(tx, p.id, me, { title, doc, kind: "edited" }) : current!.version;
    const replaced = changed && current!.version > base && current!.updated_by !== me ? current!.updated_by : null;
    await tx`delete from drafts where page_id = ${p.id} and member_id = ${me}`;
    await tx`delete from page_locks where page_id = ${p.id} and member_id = ${me}`;
    return { version, changed, replaced, dropped: dropped.pictures };
  });
}

// stopEditing gives the lock back; the draft goes too unless kept.
export async function stopEditing(sql: Sql, actor: Member | null, pageId: unknown, options: { keepDraft?: boolean } = {}): Promise<void> {
  const p = await page(sql, actor, pageId, "write");
  const me = actor!.id;
  await sql`delete from page_locks where page_id = ${p.id} and member_id = ${me}`;
  if (!options.keepDraft) await sql`delete from drafts where page_id = ${p.id} and member_id = ${me}`;
}

// The pages the actor left unsaved changes on (the home page offers them).
export async function myDrafts(sql: Query, actor: Member | null): Promise<{ pageId: string; title: string; updatedAt: Date }[]> {
  if (!actor) return [];
  const spaces = (await listSpaces(sql, actor)).filter(s => s.access === "write").map(s => s.id);
  if (spaces.length === 0) return [];
  const found = await sql<{ page_id: string; title: string; page_title: string; updated_at: Date }[]>`
    select d.page_id, d.title, p.title as page_title, d.updated_at from drafts d join pages p on p.id = d.page_id
    where d.member_id = ${actor.id} and p.deleted_at is null and p.space_id in ${sql(spaces)} order by d.updated_at desc limit 10`;
  return found.map(r => ({ pageId: String(r.page_id), title: r.title.trim() || r.page_title, updatedAt: r.updated_at }));
}
