import { chest } from "@argentic/chest-sdk/chest";
import { ChestError } from "@argentic/chest-sdk/errors";
import type { Member } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import type { Run } from "@argentic/chest-sdk/schedules";
import { spaceAccess, type SpaceAudience } from "./access.ts";
import { purgeRemoved, commenters, type Comment } from "./comments.ts";
import type { Query, Sql } from "./db.ts";
import { format } from "../i18n/index.ts";
import { email } from "./mail.ts";
import { cut, notify, withdraw } from "./notify.ts";
import { dueUntold, markTold } from "./reviews.ts";
import { membersOfTool, withAllGroups } from "./groups.ts";
import { concerns, pending, type ReadAsk } from "./reads.ts";
import { audienceOf } from "./spaces.ts";
import { watchers } from "./watching.ts";

// What the wiki tells people through the Chest's bell, each in their own
// language. Every item is keyed by its page and its reason, so a new one
// replaces the last one instead of piling up:
//
// - comments:<page> — a new comment, to the page's author, those who
//   commented before and its watchers;
// - saved:<page> — someone else saved the page, to its watchers;
// - review:<page> — the page is due for a check, to its review owner;
// - read:<page> — the page's editors ask its readers to confirm they read
//   it, to each of them until they do;
// - mention:<page> — someone named them ("@Camille Martin") in a comment.
//
// Nobody is ever told about a page they cannot read (checked at the moment
// of telling, against the space's access and the member's current role and
// groups), nor about their own doing.
const pagePath = (pageId: string) => `/chest/pages/${pageId}`;

// audience keeps, of these people, the members who may read (or write) in a
// space now. Without an answer from the Chest, nobody: telling is a
// courtesy, never a leak.
export async function audience(space: SpaceAudience, ids: Iterable<string>, needed: "read" | "write" = "read"): Promise<string[]> {
  const wanted = [...new Set(ids)].filter(i => i.startsWith("mbr_"));
  if (wanted.length === 0) return [];
  try {
    const found = await members.lookup(wanted);
    return (await withAllGroups(found.members)).filter(m => {
      const access = spaceAccess(m, space);
      return needed === "write" ? access === "write" : access !== "none";
    }).map(m => m.id);
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return [];
  }
}

export async function commented(sql: Query, actor: Member, page: { id: string; title: string; createdBy: string; space: SpaceAudience }, comment: Comment, mentioned: string[] = []): Promise<string[]> {
  // Those named in it get their own item, and not this one too.
  const named = await audience(page.space, mentioned.filter(p => p !== actor.id));
  await notify(named, t => ({ title: format(t.bell.mentioned, { name: actor.name, title: cut(page.title, 40) }), body: comment.body }), { path: `${pagePath(page.id)}#comment-${comment.id}`, key: `mention:${page.id}` });
  const people = [page.createdBy, ...(await commenters(sql, page.id)), ...(await watchers(sql, page.id))].filter(p => p !== actor.id && !named.includes(p));
  const told = await audience(page.space, people);
  // A reply says so: "Camille replied on …".
  await notify(told, t => ({ title: format(comment.parentId ? t.bell.replied : t.bell.commented, { name: actor.name, title: cut(page.title, 40) }), body: comment.body }), { path: `${pagePath(page.id)}#comment-${comment.id}`, key: `comments:${page.id}` });
  await remember(sql, page.id, named, "mention", comment.id);
  await remember(sql, page.id, told, "comments", comment.id);
  return [...named, ...told];
}

// Which comment each person's item of a page now shows.
async function remember(sql: Query, pageId: string, ids: string[], reason: "comments" | "mention", commentId: string): Promise<void> {
  if (ids.length === 0) return;
  await sql`insert into comment_notices ${sql(ids.map(member_id => ({ page_id: pageId, member_id, reason, comment_id: commentId })), "page_id", "member_id", "reason", "comment_id")}
    on conflict (page_id, member_id, reason) do update set comment_id = excluded.comment_id`;
}

async function noticesOf(sql: Query, commentId: string): Promise<{ member_id: string; reason: "comments" | "mention"; page_id: string }[]> {
  return sql<{ member_id: string; reason: "comments" | "mention"; page_id: string }[]>`
    select n.member_id, n.reason, n.page_id from comment_notices n join page_comments c on c.id = n.comment_id
    where n.comment_id = ${commentId} or c.parent_id = ${commentId}`;
}

// A comment deleted (with its replies, at the top): the bell items that
// show its words go at once, from everyone.
export async function commentGone(sql: Query, commentId: string): Promise<void> {
  const told = await noticesOf(sql, commentId);
  for (const reason of ["mention", "comments"] as const) {
    const byPage = new Map<string, string[]>();
    for (const n of told.filter(x => x.reason === reason)) byPage.set(String(n.page_id), [...(byPage.get(String(n.page_id)) ?? []), n.member_id]);
    for (const [pageId, ids] of byPage) await withdraw(`${reason}:${pageId}`, ids.slice(0, 500));
  }
}

// A comment brought back (Undo) or edited: the same people see its words
// as they are now.
export async function commentShown(sql: Query, commentId: string, page: { id: string; title: string }): Promise<void> {
  const [c] = await sql<{ id: string; author: string; body: string; parent_id: string | null }[]>`select id, author, body, parent_id from page_comments where id = ${commentId} and removed_at is null`;
  if (!c) return;
  const [author] = (await members.lookup([c.author]).catch(() => ({ members: [] }))).members;
  const name = author?.name ?? "";
  const path = `${pagePath(page.id)}#comment-${c.id}`;
  const mine = await sql<{ member_id: string; reason: "comments" | "mention" }[]>`select member_id, reason from comment_notices where comment_id = ${commentId}`;
  if (mine.length === 0) return;
  const of = (reason: string) => mine.filter(n => n.reason === reason).map(n => n.member_id);
  await notify(of("mention"), t => ({ title: format(t.bell.mentioned, { name: name || t.people.unknown, title: cut(page.title, 40) }), body: c.body }), { path, key: `mention:${page.id}` });
  await notify(of("comments"), t => ({ title: format(c.parent_id ? t.bell.replied : t.bell.commented, { name: name || t.people.unknown, title: cut(page.title, 40) }), body: c.body }), { path, key: `comments:${page.id}` });
}

export async function saved(sql: Query, actor: Member, page: { id: string; title: string; space: SpaceAudience }): Promise<string[]> {
  const told = await audience(page.space, (await watchers(sql, page.id)).filter(p => p !== actor.id));
  await notify(told, t => ({ title: format(t.bell.saved, { name: actor.name, title: cut(page.title, 44) }) }), { path: pagePath(page.id), key: `saved:${page.id}` });
  return told;
}

// A page checked, or its reminder changed: the item asking for it goes.
export async function reviewSettled(pageId: string): Promise<void> {
  await withdraw(`review:${pageId}`);
}

const keysOf = (pageId: string) => [`comments:${pageId}`, `saved:${pageId}`, `review:${pageId}`, `read:${pageId}`, `mention:${pageId}`];

// The members asked to confirm they read a page: those who read its space
// now (and are in its groups, when the editors chose some). Without an
// answer from the Chest, nobody.
export async function askedToRead(space: SpaceAudience, ask: ReadAsk, all?: Member[]): Promise<Member[]> {
  return (all ?? await membersOfTool()).filter(m => spaceAccess(m, space) !== "none" && concerns(ask, m));
}

// A page to read and confirm: each person asked is told (not the one
// asking), in the bell and by email; asked again, the item is replaced
// (and a new email says so: the key holds the version and the moment).
export async function readAsked(actor: Member, page: { id: string; title: string; space: SpaceAudience }, ask: ReadAsk): Promise<number> {
  const asked = (await askedToRead(page.space, ask)).filter(m => m.id !== actor.id);
  const told = asked.map(m => m.id);
  await notify(told, t => ({ title: format(t.bell.read, { name: actor.name, title: cut(page.title, 44) }), body: t.bell.readBody }), { path: pagePath(page.id), key: `read:${page.id}` });
  await email(asked, t => ({
    letter: { subject: format(t.bell.read, { name: actor.name, title: cut(page.title, 120) }), lines: [format(t.mail.readLine, { name: actor.name }), "", page.title, "", t.bell.readBody] },
    path: pagePath(page.id),
    why: t.mail.whyRead,
  }), person => `read:${page.id}:${ask.version}:${Math.floor(ask.at.getTime() / 1000)}:${person.id}`);
  return told.length;
}

// A reminder to those asked who have not confirmed the current version:
// by an editor ("Remind those who have not"), or by the weekday schedule a
// week after the ask (twice at most). The bell item comes back to the top
// and an email goes, once a day at most per person.
export async function remindReaders(sql: Query, page: { id: string; title: string; space: SpaceAudience }, ask: ReadAsk, day: string): Promise<number> {
  const all = await askedToRead(page.space, ask);
  const waiting = await pending(sql, page.id, ask, all.map(m => m.id));
  const people = all.filter(m => waiting.includes(m.id));
  if (people.length === 0) return 0;
  await notify(people.map(m => m.id), t => ({ title: format(t.bell.remind, { title: cut(page.title, 50) }), body: t.bell.readBody }), { path: pagePath(page.id), key: `read:${page.id}` });
  await email(people, t => ({
    letter: { subject: format(t.bell.remind, { title: cut(page.title, 120) }), lines: [t.mail.remindLine, "", page.title, "", t.bell.readBody] },
    path: pagePath(page.id),
    why: t.mail.whyRead,
  }), person => `remind:${page.id}:${day}:${person.id}`);
  await sql`update pages set read_reminded_at = now(), read_reminders = read_reminders + 1 where id = ${page.id}`;
  return people.length;
}

// Confirmed, or no longer asked: the item goes (from one person, or all).
export async function readSettled(pageId: string, members?: string[]): Promise<void> {
  await withdraw(`read:${pageId}`, members);
}

// Pages in the trash: what was said about them goes from every bell (only
// for the pages someone could have been told about).
export async function forget(sql: Query, pageIds: string[]): Promise<void> {
  if (pageIds.length === 0) return;
  const told = await sql<{ id: string }[]>`
    select id from pages p where id in ${sql(pageIds)} and (review_months is not null or read_asked_at is not null
      or exists (select 1 from page_watchers w where w.page_id = p.id) or exists (select 1 from page_comments c where c.page_id = p.id))
    limit 200`;
  for (const { id } of told) for (const key of keysOf(String(id))) await withdraw(key);
}

// A page (with its subpages) moved to another space: those who could be
// told about it and no longer see it lose what they were told.
export async function moved(sql: Query, pageId: string, spaceId: string): Promise<void> {
  const space = await audienceOf(sql, spaceId);
  if (!space) return;
  const rows = await sql<{ id: string; people: string[] }[]>`
    with recursive down (id) as (select ${pageId}::bigint union all select c.id from pages c join down d on c.parent_id = d.id)
    select p.id, array_remove(array[p.created_by, p.review_owner]
      || array(select member_id from page_watchers w where w.page_id = p.id)
      || array(select distinct author from page_comments c where c.page_id = p.id), null) as people
    from pages p where p.id in (select id from down) limit 500`;
  // Pages whose readers were asked to confirm: whoever lost them loses the item.
  const asked = await sql<{ id: string; read_asked_at: Date; read_version: number; read_groups: string[] }[]>`
    with recursive down (id) as (select ${pageId}::bigint union all select c.id from pages c join down d on c.parent_id = d.id)
    select id, read_asked_at, read_version, read_groups from pages where id in (select id from down) and read_asked_at is not null limit 500`;
  if (asked.length > 0) {
    const all = await membersOfTool();
    for (const a of asked) {
      const kept = new Set((await askedToRead(space, { at: a.read_asked_at, by: null, version: a.read_version, groups: a.read_groups }, all)).map(m => m.id));
      const lost = all.map(m => m.id).filter(id => !kept.has(id));
      for (let i = 0; i < lost.length; i += 500) await withdraw(`read:${a.id}`, lost.slice(i, i + 500));
    }
  }
  const everyone = [...new Set(rows.flatMap(r => r.people))].filter(p => p.startsWith("mbr_"));
  if (everyone.length === 0) return;
  const still = new Set(await audience(space, everyone));
  for (const r of rows) {
    const gone = [...new Set(r.people)].filter(p => p.startsWith("mbr_") && !still.has(p));
    if (gone.length > 0) for (const key of keysOf(String(r.id))) await withdraw(key, gone.slice(0, 500));
  }
}

// The "reviews" schedule, each weekday morning: every page that came due
// tells its owner, once — or, when the owner can no longer write there,
// the last person who saved it. A page nobody can be told about waits for
// the next morning. Idempotent: an item already sent is never sent again
// (review_told), and a run delivered twice replaces the same key.
export async function reviews(sql: Sql, run?: Run): Promise<{ told: number; reminded: number }> {
  await purgeRemoved(sql);
  // The Chest's day (a run at 00:30 in Paris is not yesterday's, as in UTC).
  const day = chest.today(run ? new Date(run.scheduledAt) : new Date());
  let count = 0;
  const spaces = new Map<string, SpaceAudience | null>();
  for (const due of await dueUntold(sql)) {
    if (!spaces.has(due.spaceId)) spaces.set(due.spaceId, await audienceOf(sql, due.spaceId));
    const space = spaces.get(due.spaceId);
    if (!space) continue;
    const writers = new Set(await audience(space, [due.owner, due.lastEditor].filter((p): p is string => p !== null), "write"));
    const to = due.owner && writers.has(due.owner) ? due.owner : writers.has(due.lastEditor) ? due.lastEditor : null;
    if (!to) continue;
    await notify([to], t => ({ title: format(t.bell.review, { title: cut(due.title, 50) }), body: t.bell.reviewBody }), { path: pagePath(due.id), key: `review:${due.id}` });
    // By email too: the owner may not open the Chest for weeks.
    const [person] = (await members.lookup([to]).catch(() => ({ members: [] }))).members;
    if (person) {
      await email([person], t => ({
        letter: { subject: format(t.bell.review, { title: cut(due.title, 120) }), lines: [t.mail.reviewLine, "", due.title, "", t.bell.reviewBody] },
        path: pagePath(due.id),
        why: t.mail.whyReview,
      }), p => `review:${due.id}:${day}:${p.id}`);
    }
    await markTold(sql, due.id);
    count++;
  }
  // The pages asked a week ago or more, and not reminded for a week: those
  // who have not confirmed are reminded (twice at most).
  let reminded = 0;
  const asked = await sql<{ id: string; title: string; space_id: string; read_asked_at: Date; read_asked_by: string | null; read_version: number; read_groups: string[] }[]>`
    select id, title, space_id, read_asked_at, read_asked_by, read_version, read_groups from pages
    where read_asked_at is not null and deleted_at is null and read_asked_at <= now() - interval '7 days'
      and read_reminders < 2 and (read_reminded_at is null or read_reminded_at <= now() - interval '7 days')
    order by read_asked_at limit 50`;
  for (const a of asked) {
    if (!spaces.has(String(a.space_id))) spaces.set(String(a.space_id), await audienceOf(sql, String(a.space_id)));
    const space = spaces.get(String(a.space_id));
    if (!space) continue;
    reminded += await remindReaders(sql, { id: String(a.id), title: a.title, space }, { at: a.read_asked_at, by: a.read_asked_by, version: a.read_version, groups: a.read_groups ?? [] }, day);
  }
  return { told: count, reminded };
}

// Someone moved between groups, or a group changed or went (Proposal
// (studio) "groups"): whoever a page's confirmation no longer concerns
// loses its item.
export async function reconcileReads(sql: Query, only: { member?: string; group?: string } = {}): Promise<void> {
  const asked = await sql<{ id: string; space_id: string; read_asked_at: Date; read_asked_by: string | null; read_version: number; read_groups: string[] }[]>`
    select p.id, p.space_id, p.read_asked_at, p.read_asked_by, p.read_version, p.read_groups from pages p
    where p.read_asked_at is not null and p.deleted_at is null
      and ${only.group ? sql`(${only.group} = any(p.read_groups) or exists (select 1 from space_groups g where g.space_id = p.space_id and g.group_id = ${only.group}))` : sql`true`}
    limit 500`;
  if (asked.length === 0) return;
  const all = await membersOfTool();
  const ids = only.member ? [only.member] : all.map(m => m.id);
  for (const a of asked) {
    const space = await audienceOf(sql, String(a.space_id));
    if (!space) continue;
    const kept = new Set((await askedToRead(space, { at: a.read_asked_at, by: a.read_asked_by, version: a.read_version, groups: a.read_groups ?? [] }, all)).map(m => m.id));
    const lost = ids.filter(id => !kept.has(id));
    for (let i = 0; i < lost.length; i += 500) await withdraw(`read:${a.id}`, lost.slice(i, i + 500));
  }
}
