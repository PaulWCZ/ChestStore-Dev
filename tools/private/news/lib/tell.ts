import { CapabilityNotGranted, ChestError, QuotaExceeded, RateLimited } from "@argentic/chest-sdk/errors";
import type { Locale, Member } from "@argentic/chest-sdk/member";
import * as notifications from "@argentic/chest-sdk/notifications";
import { page, type Reader, maxPages } from "./audience.ts";
import type { Sql } from "./db.ts";
import { catalogue, format } from "./i18n/index.ts";
import { excerpt } from "./markdown.ts";
import { badges, cut, notify, withdraw } from "./notify.ts";
import { purge, unconfirmedCounts } from "./posts.ts";
import { removeObjects } from "./storage.ts";

// What News tells people through the Chest's bell, each in their own
// language, and the number on its tile (Important posts not yet confirmed).
//
// An Important post, once published, is told to everyone who has News, a
// page of 500 members at a time. The Chest takes 1,000 recipients an hour
// per tool: beyond, it refuses (QuotaExceeded) and News keeps where it
// stopped (announce_after) and goes on at the next pass — a pass runs on
// the "publish" schedule (every 15 minutes, Proposal (studio)) and whenever
// someone opens the front page. The item has one key per post: telling
// again replaces it, never doubles it.
export const postPath = (postId: string) => `/chest/posts/${postId}`;
const importantKey = (postId: string) => `post:${postId}:important`;

type Due = { id: string; title: string; body: string; author: string; important: boolean; kind: string; welcome: string | null; announce_after: string | null };

// A result of telling one post: done, or stopped (quota, Chest unreachable)
// at a cursor to go on from.
type Told = { done: true } | { done: false; after: string | null };

function byLocale(people: Reader[]): Map<Locale, string[]> {
  const groups = new Map<Locale, string[]>();
  for (const p of people) groups.set(p.locale, [...(groups.get(p.locale) ?? []), p.id]);
  return groups;
}

async function tellEveryone(sql: Sql, post: Due): Promise<Told> {
  let after = post.announce_after;
  for (let i = 0; i < maxPages; i++) {
    let found;
    try {
      found = await page(after);
    } catch (error) {
      if (error instanceof CapabilityNotGranted) return { done: true };
      if (error instanceof ChestError) return { done: false, after };
      throw error;
    }
    const confirmed = new Set((await sql<{ member: string }[]>`select member from confirmations where post_id = ${post.id}`).map(r => r.member));
    const people = found.people.filter(p => p.id !== post.author && !confirmed.has(p.id));
    for (const [locale, group] of byLocale(people)) {
      const t = catalogue(locale);
      try {
        await notifications.notify(group, { title: cut(format(t.bell.important, { title: post.title }), 80), body: cut(excerpt(post.body, 270) || t.bell.importantBody, 280), path: postPath(post.id), key: importantKey(post.id) });
      } catch (error) {
        if (error instanceof CapabilityNotGranted) return { done: true };
        if (error instanceof QuotaExceeded || error instanceof RateLimited || error instanceof ChestError) return { done: false, after };
        throw error;
      }
    }
    await badges(await unconfirmedCounts(sql, people.map(p => p.id)));
    if (!found.next) return { done: true };
    after = found.next;
    await sql`update posts set announce_after = ${after} where id = ${post.id}`;
  }
  return { done: true };
}

async function tellWelcomed(post: Due): Promise<Told> {
  if (!post.welcome || post.welcome === "erased") return { done: true };
  await notify([post.welcome], t => ({ title: t.bell.welcome, body: post.title }), { path: postPath(post.id), key: `post:${post.id}:welcome` });
  return { done: true };
}

// announce tells what is due: Important posts and welcomes published in the
// last 7 days and not yet told. Two passes never tell the same post at once
// (a two-minute lease). It stops at the first post the Chest refuses.
export async function announce(sql: Sql, now = new Date()): Promise<{ told: string[]; waiting: string[] }> {
  const due = await sql<{ id: string }[]>`
    select id from posts where announced_at is null and deleted_at is null and (important or kind = 'welcome')
      and publish_at <= ${now} and publish_at > ${now}::timestamptz - interval '7 days'
    order by publish_at, id limit 10`;
  const told: string[] = [];
  const waiting: string[] = [];
  for (const { id } of due) {
    const [post] = await sql<Due[]>`
      update posts set announce_lease = ${now} where id = ${id} and announced_at is null and (announce_lease is null or announce_lease < ${now}::timestamptz - interval '2 minutes')
      returning id, title, body, author, important, kind, welcome, announce_after`;
    if (!post) continue;
    const key = String(post.id);
    const result = post.important ? await tellEveryone(sql, { ...post, id: key }) : await tellWelcomed({ ...post, id: key });
    if (result.done) {
      await sql`update posts set announced_at = ${now}, announce_after = null, announce_lease = null where id = ${key}`;
      told.push(key);
    } else {
      await sql`update posts set announce_after = ${result.after}, announce_lease = null where id = ${key}`;
      waiting.push(key);
      break;
    }
  }
  return { told, waiting };
}

// pass is the work News does by itself, on its schedule or on a visit: tell
// what is due, and purge what was deleted long ago.
export async function pass(sql: Sql, now = new Date()): Promise<{ told: string[]; waiting: string[] }> {
  const result = await announce(sql, now);
  await removeObjects(await purge(sql));
  return result;
}

// A new comment: the post's author hears of it (not of their own).
export async function commented(actor: Member, post: { id: string; title: string; author: string }, body: string): Promise<void> {
  if (post.author === actor.id || post.author === "erased") return;
  await notify([post.author], t => ({ title: format(t.bell.commented, { name: actor.name, title: cut(post.title, 40) }), body: cut(body, 280) }), { path: postPath(post.id) + "#comments", key: `post:${post.id}:comments` });
}

// A reminder to those who have not confirmed: the same item, again unread.
export async function remind(post: { id: string; title: string; body: string }, pending: Reader[]): Promise<void> {
  for (const [locale, group] of byLocale(pending)) {
    const t = catalogue(locale);
    for (let i = 0; i < group.length; i += 500) {
      try {
        await notifications.notify(group.slice(i, i + 500), { title: cut(format(t.bell.reminder, { title: post.title }), 80), body: cut(excerpt(post.body, 270) || t.bell.importantBody, 280), path: postPath(post.id), key: importantKey(post.id) });
      } catch (error) {
        if (!(error instanceof ChestError)) throw error;
      }
    }
  }
}

// Confirmed: the item goes from that member's bell.
export async function confirmed(sql: Sql, memberId: string, postId: string): Promise<void> {
  await withdraw(importantKey(postId), [memberId]);
  await badges(await unconfirmedCounts(sql, [memberId]));
}

// A post deleted, or no longer Important: its items go from every bell.
export async function settled(postId: string): Promise<void> {
  await withdraw(importantKey(postId));
}

// refreshBadges sets these members' numbers; refreshEveryone, everyone's
// (after an Important post is deleted, restored or changed). The Chest takes
// 600 badge writes a minute: in a larger company the rest are set right at
// each member's next visit.
export async function refreshBadges(sql: Sql, memberIds: string[]): Promise<void> {
  const unique = [...new Set(memberIds)].filter(m => m.startsWith("mbr_"));
  if (unique.length > 0) await badges(await unconfirmedCounts(sql, unique));
}

export async function refreshEveryone(sql: Sql): Promise<void> {
  let after: string | null = null;
  for (let i = 0; i < maxPages; i++) {
    let found;
    try {
      found = await page(after);
    } catch (error) {
      if (error instanceof ChestError) return;
      throw error;
    }
    await badges(await unconfirmedCounts(sql, found.people.map(p => p.id)));
    if (!found.next) return;
    after = found.next;
  }
}

// catchUp is the pass a visit runs, so News works on a Chest without
// schedules: what is due is told when someone opens the front page; the
// purge runs at most every 10 minutes per server.
let lastPurge = 0;
export async function catchUp(sql: Sql, now = new Date()): Promise<void> {
  await announce(sql, now);
  if (now.getTime() - lastPurge > 10 * 60 * 1000) {
    lastPurge = now.getTime();
    await removeObjects(await purge(sql));
  }
}
