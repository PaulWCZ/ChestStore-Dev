import { CapabilityNotGranted, ChestError, QuotaExceeded, RateLimited } from "@argentic/chest-sdk/errors";
import { localeOf, type Locale, type Member } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import * as notifications from "@argentic/chest-sdk/notifications";
import { inAudience, type Audience, type Grouped } from "./access.ts";
import { everyone, page, publisherIds, type Reader, maxPages } from "./audience.ts";
import type { Sql } from "./db.ts";
import { continueDigest, seenDigest } from "./digest.ts";
import { withGroups } from "./groups.ts";
import { catalogue, format, plural } from "../i18n/index.ts";
import { email, type Recipient } from "./mailer.ts";
import { excerpt, plain } from "../shared/markdown.ts";
import { limits, pick, withNames, type Version } from "../shared/model.ts";
import { badges, cut, notify, withdraw } from "./notify.ts";
import { nameOf, people as lookup } from "./people.ts";
import { mentionsIn, purge, unconfirmedCounts } from "./posts.ts";
import { removeObjects } from "./storage.ts";
import { waitingCount, type Approved, type Declined } from "./proposals.ts";
import { answerLines, answerLinker, type Links } from "./answer-links.ts";
import { today } from "./time.ts";
import { chestZone } from "./zone.ts";

// What News tells people, each in their own language: through the Chest's
// bell, by email for what matters, and the number on its tile (Important
// posts not yet confirmed).
//
// An Important post, once published, is told to its audience (everyone who
// has News, or the members of its groups and the people picked), a page of
// 500 members at a time: in the bell, and by email to each person (lib/
// mailer.ts). The Chest takes 1,000 bell recipients an hour per tool:
// beyond, it refuses (QuotaExceeded) and News keeps where it stopped
// (announce_after) and goes on at the next pass — a pass runs on the
// "publish" schedule (every 15 minutes, Proposal (studio)) and whenever
// someone opens the front page. The bell item has one key per post:
// telling again replaces it, never doubles it; an email is sent once per
// person and request to confirm (the emails table).
export const postPath = (postId: string) => `/chest/posts/${postId}`;
export const importantKey = (postId: string) => `post:${postId}:important`;

type Due = Audience & {
  id: string; title: string; body: string; locale: string; versions: Version[]; author: string; important: boolean; kind: string;
  welcome: string | null; announce_after: string | null; confirm_from: number; email_short: boolean;
};

// A result of telling one post: done, or stopped (quota, Chest unreachable)
// at a cursor to go on from.
type Told = { done: true } | { done: false; after: string | null };

function byLocale<P extends { id: string; locale: Locale }>(people: P[]): Map<Locale, P[]> {
  const groups = new Map<Locale, P[]>();
  for (const p of people) groups.set(p.locale, [...(groups.get(p.locale) ?? []), p]);
  return groups;
}

// The bell item of an Important post (or its reminder), in one language.
function bellItem(post: Pick<Due, "id" | "title" | "body" | "locale" | "versions">, locale: Locale, reminder = false) {
  const t = catalogue(locale);
  const shown = pick(post, locale);
  return { title: cut(format(reminder ? t.bell.reminder : t.bell.important, { title: shown.title }), 80), body: cut(excerpt(shown.body, 270) || t.bell.importantBody, 280), path: postPath(post.id), key: importantKey(post.id) };
}

// The email of an Important post (or its reminder), in the reader's
// language: its headline, its whole text, the link to confirm.
// An event still open to answers: "I'm coming" and "Not coming" as links
// of their own (lib/answer-links.ts).
function importantLetter(post: Pick<Due, "id" | "title" | "body" | "locale" | "versions">, authorName: (locale: Locale) => string, reminder = false, answers: ((memberId: string) => Links) | null = null) {
  return (t: ReturnType<typeof catalogue>, person: Recipient) => {
    const shown = pick(post, person.locale);
    const text = plain(shown.body).trim();
    return {
      letter: { subject: format(reminder ? t.mail.reminderSubject : t.mail.importantSubject, { title: shown.title }), lines: [shown.title, "", ...(text ? [text, ""] : []), ...(answers ? answerLines(t, answers(person.id), format) : []), t.mail.confirm] },
      path: postPath(post.id),
      why: format(t.mail.whyImportant, { name: authorName(person.locale) }),
    };
  };
}

// The links of an event still open to answers, for each person; null for
// any other post.
async function answersFor(sql: Sql, postId: string, now = new Date()): Promise<((memberId: string) => Links) | null> {
  const [row] = await sql<{ open: boolean }[]>`select kind = 'event' and coalesce(event_last_day, event_day) >= ${today(chestZone(), now)} as open from posts where id = ${postId}`;
  if (!row?.open) return null;
  const linker = await answerLinker(sql);
  return memberId => linker(postId, memberId);
}

async function authorNames(author: string): Promise<(locale: Locale) => string> {
  const who = (await lookup([author])).get(author);
  return locale => nameOf(who, locale);
}

async function tellEveryone(sql: Sql, post: Due): Promise<Told> {
  let after = post.announce_after;
  const author = await authorNames(post.author);
  const answers = await answersFor(sql, post.id);
  let emailing = !post.email_short;
  for (let i = 0; i < maxPages; i++) {
    let found;
    try {
      found = await page(after);
    } catch (error) {
      if (error instanceof CapabilityNotGranted) return { done: true };
      if (error instanceof ChestError) return { done: false, after };
      throw error;
    }
    const confirmed = new Set((await sql<{ member: string }[]>`select member from confirmations where post_id = ${post.id} and version >= ${post.confirm_from}`).map(r => r.member));
    const people = found.people.filter(p => p.id !== post.author && inAudience(p, post) && !confirmed.has(p.id));
    for (const [locale, group] of byLocale(people)) {
      try {
        await notifications.notify(group.map(p => p.id), bellItem(post, locale));
      } catch (error) {
        if (error instanceof CapabilityNotGranted) break;
        if (error instanceof QuotaExceeded || error instanceof RateLimited || error instanceof ChestError) return { done: false, after };
        throw error;
      }
    }
    if (emailing && people.length > 0) {
      const already = new Set((await sql<{ member: string }[]>`select member from emails where post_id = ${post.id} and version = ${post.confirm_from} and member in ${sql(people.map(p => p.id))}`).map(r => r.member));
      const result = await email(sql, people.filter(p => !already.has(p.id)), importantLetter(post, author, false, answers), p => `news:${post.id}:${post.confirm_from}:${p.id}`);
      if (result.sent.length > 0) await sql`insert into emails ${sql(result.sent.map(member => ({ post_id: post.id, member, version: post.confirm_from })))} on conflict do nothing`;
      if (result.stop === "unavailable") return { done: false, after };
      if (result.stop === "quota") await sql`update posts set email_short = true where id = ${post.id}`;
      if (result.stop !== null) emailing = false;
    }
    await badges(await unconfirmedCounts(sql, people));
    if (!found.next) return { done: true };
    after = found.next;
    await sql`update posts set announce_after = ${after} where id = ${post.id}`;
  }
  return { done: true };
}

// The new colleague is told only when the post is for them.
async function tellWelcomed(post: Due): Promise<Told> {
  if (!post.welcome || post.welcome === "erased") return { done: true };
  if (post.groups.length > 0 || post.people.length > 0) {
    let colleague;
    try {
      colleague = await members.get(post.welcome);
    } catch (error) {
      if (error instanceof CapabilityNotGranted) return { done: true };
      if (error instanceof ChestError) return { done: false, after: null };
      throw error;
    }
    if (!colleague || !inAudience(colleague, post)) return { done: true };
  }
  // A welcome greets them; a shout-out says who thanks them.
  const author = post.kind === "shoutout" ? await authorNames(post.author) : null;
  await notify([post.welcome], (t, locale) => ({ title: author ? format(t.bell.thanked, { name: author(locale) }) : t.bell.welcome, body: pick(post, locale).title }), { path: postPath(post.id), key: `post:${post.id}:welcome` });
  return { done: true };
}

// announce tells what is due: Important posts, welcomes and shout-outs
// published — or made due again by an edit (announce_due: made Important,
// another audience, asked to confirm again) — in the last 7 days, and not
// yet told. Past 7 days a post is no longer news (the Chest was not
// reached for a week). Telling again never doubles anything: the bell item
// has one key per post, an email goes once per person and version, and
// who confirmed is not asked again. Two passes never tell the same post at once
// (a two-minute lease). It stops at the first post the Chest refuses.
export async function announce(sql: Sql, now = new Date()): Promise<{ told: string[]; waiting: string[] }> {
  const due = await sql<{ id: string }[]>`
    select id from posts where announced_at is null and deleted_at is null and (important or kind in ('welcome', 'shoutout'))
      and publish_at <= ${now} and greatest(publish_at, announce_due) > ${now}::timestamptz - interval '7 days'
    order by publish_at, id limit 10`;
  const told: string[] = [];
  const waiting: string[] = [];
  for (const { id } of due) {
    const [post] = await sql<Due[]>`
      update posts set announce_lease = ${now} where id = ${id} and announced_at is null and (announce_lease is null or announce_lease < ${now}::timestamptz - interval '2 minutes')
      returning id, title, body, locale, author, important, kind, welcome, announce_after, confirm_from, email_short,
        coalesce((select json_agg(json_build_object('locale', v.locale, 'title', v.title, 'body', v.body)) from post_versions v where v.post_id = posts.id), '[]'::json) as versions,
        array(select g.group_id from post_groups g where g.post_id = posts.id) as groups,
        array(select pp.member from post_people pp where pp.post_id = posts.id) as people`;
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

// pass is the work News does by itself on its schedule: tell what is due,
// go on with a weekly digest the hourly quota stopped (after the Important
// posts: they come first), and purge what was deleted long ago.
export async function pass(sql: Sql, now = new Date()): Promise<{ told: string[]; waiting: string[] }> {
  const result = await announce(sql, now);
  if (result.waiting.length === 0) await continueDigest(sql, now);
  await removeObjects(await purge(sql));
  return result;
}

// A new comment: the post's author hears of it (not of their own); a reply,
// the author of the comment it answers; a mention, the person mentioned
// when they can see the post. Each hears once, of the most specific.
export async function commented(actor: Member, done: { comment: { id: string; body: string }; post: Audience & { id: string; title: string; author: string }; parentAuthor: string | null; mentioned: string[] }): Promise<void> {
  const { post, comment } = done;
  const told = new Set<string>([actor.id, "erased"]);
  const path = postPath(post.id) + "#comment-" + comment.id;
  const text = cut(await readable(comment.body), 280);
  await mentionedIn(actor, post, done.mentioned, comment.body, path, told);
  if (done.parentAuthor && !told.has(done.parentAuthor)) {
    told.add(done.parentAuthor);
    await notify([done.parentAuthor], t => ({ title: format(t.bell.replied, { name: actor.name, title: cut(post.title, 40) }), body: text }), { path, key: `post:${post.id}:replies` });
  }
  if (!told.has(post.author)) {
    await notify([post.author], t => ({ title: format(t.bell.commented, { name: actor.name, title: cut(post.title, 40) }), body: text }), { path: postPath(post.id) + "#comments", key: `post:${post.id}:comments` });
  }
}

// mentionedIn tells the people mentioned in a comment who can see the post
// (its audience, its author, the admins); the others are not told.
export async function mentionedIn(actor: Member, post: Audience & { id: string; title: string; author: string }, mentioned: string[], body: string, path: string, told = new Set<string>([actor.id])): Promise<void> {
  const wanted = mentioned.filter(m => !told.has(m));
  if (wanted.length === 0) return;
  let found: Awaited<ReturnType<typeof members.lookup>>["members"] = [];
  try {
    found = (await members.lookup(wanted)).members;
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
  const allowed = found.filter(m => m.role !== null && (m.isAdmin || m.id === post.author || inAudience(m, post))).map(m => m.id);
  for (const m of allowed) told.add(m);
  const text = cut(await readable(body), 280);
  await notify(allowed, t => ({ title: format(t.bell.mentioned, { name: actor.name, title: cut(post.title, 40) }), body: text }), { path, key: `post:${post.id}:mention` });
}

// readable writes a comment's mentions as names, for the bell.
async function readable(body: string): Promise<string> {
  const ids = mentionsIn(body);
  if (ids.length === 0) return body;
  const who = await lookup(ids);
  return withNames(body, id => nameOf(who.get(id), "en"));
}

// A seat freed for someone who was waiting.
export async function promoted(memberId: string, post: { id: string; title: string }): Promise<void> {
  await notify([memberId], t => ({ title: format(t.bell.seat, { title: cut(post.title, 50) }) }), { path: postPath(post.id), key: `post:${post.id}:seat` });
}

// A reminder to those who have not confirmed: the same item, again unread,
// and an email.
export async function remind(sql: Sql, post: Pick<Due, "id" | "title" | "body" | "locale" | "versions" | "author">, pending: Reader[], day: string): Promise<void> {
  for (const [locale, group] of byLocale(pending)) {
    for (let i = 0; i < group.length; i += 500) {
      try {
        await notifications.notify(group.slice(i, i + 500).map(p => p.id), bellItem(post, locale, true));
      } catch (error) {
        if (!(error instanceof ChestError)) throw error;
      }
    }
  }
  await email(sql, pending, importantLetter(post, await authorNames(post.author), true, await answersFor(sql, post.id)), p => `remind:${post.id}:${day}:${p.id}`);
}

// Confirmed: the item goes from that member's bell.
export async function confirmed(sql: Sql, person: Grouped, postId: string): Promise<void> {
  await withdraw(importantKey(postId), [person.id]);
  await badges(await unconfirmedCounts(sql, [person]));
}

// A post deleted, or no longer Important: its items go from every bell.
export async function settled(postId: string): Promise<void> {
  await withdraw(importantKey(postId));
}

// reconcile withdraws the bell item of open Important posts from whoever
// they are no longer for (someone left a group, a group was removed), and
// sets everyone's number again. only: the posts of that group, or that
// person alone (all posts, everyone otherwise).
export async function reconcile(sql: Sql, only?: { group?: string; member?: string }): Promise<void> {
  const open = await sql<(Audience & { id: string; author: string })[]>`
    select p.id, p.author, array(select g.group_id from post_groups g where g.post_id = p.id) as groups,
      array(select pp.member from post_people pp where pp.post_id = p.id) as people
    from posts p where p.important and p.deleted_at is null and p.publish_at <= now() and p.publish_at > now() - make_interval(days => ${limits.confirmDays})
      and (exists (select 1 from post_groups g where g.post_id = p.id) or exists (select 1 from post_people pp where pp.post_id = p.id))
      ${only?.group ? sql`and exists (select 1 from post_groups g where g.post_id = p.id and g.group_id = ${only.group})` : sql``}`;
  if (open.length === 0) return;
  let people: Reader[];
  if (only?.member) {
    let one;
    try {
      one = await members.get(only.member);
    } catch (error) {
      if (error instanceof ChestError) return;
      throw error;
    }
    if (!one) {
      for (const p of open) await withdraw(importantKey(String(p.id)), [only.member]);
      return;
    }
    people = [await withGroups({ id: one.id, name: one.name, photo: one.photo, locale: localeOf(one.language), role: one.role, groups: one.groups })];
  } else {
    const all = await everyone();
    if (!all.complete && all.people.length === 0) return;
    people = all.people;
  }
  for (const p of open) {
    const out = people.filter(x => !inAudience(x, p)).map(x => x.id);
    for (let i = 0; i < out.length; i += 500) await withdraw(importantKey(String(p.id)), out.slice(i, i + 500));
  }
  await badges(await unconfirmedCounts(sql, people));
}

// refreshBadges sets these members' numbers; refreshEveryone, everyone's
// (after an Important post is deleted, restored or changed). The Chest takes
// 600 badge writes a minute: in a larger company the rest are set right at
// each member's next visit.
export async function refreshBadges(sql: Sql, people: Grouped[]): Promise<void> {
  const unique = people.filter(p => p.id.startsWith("mbr_"));
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
    await badges(await unconfirmedCounts(sql, found.people));
    if (!found.next) return;
    after = found.next;
  }
}

// catchUp is the pass a visit runs, so News works on a Chest without
// schedules: what is due is told when someone opens the front page (or
// when the "Undo" seconds of a post end, lib/posts.ts); the purge runs at
// most every 10 minutes per server. The visitor's weekly digest leaves
// their bell: they are here. (The digest itself needs the schedule: a
// visit never sends one.)
let lastPurge = 0;
export async function catchUp(sql: Sql, now = new Date(), visitor?: string): Promise<void> {
  await announce(sql, now);
  if (visitor) await seenDigest(sql, visitor);
  if (now.getTime() - lastPurge > 10 * 60 * 1000) {
    lastPurge = now.getTime();
    await removeObjects(await purge(sql));
  }
}

// Posts from everyone (lib/proposals.ts). The publishers have one bell
// item saying how many wait, replaced at each change and withdrawn when
// none is left; the author is told when their post is published or
// declined (with the reason, if one was given); the colleague a shout-out
// thanks is told by announce() once it is published.
export const proposalsKey = "proposals";
const proposalKey = (proposalId: string) => `proposal:${proposalId}`;

export async function proposalsWaiting(sql: Sql): Promise<void> {
  const count = await waitingCount(sql);
  if (count === 0) return withdraw(proposalsKey);
  const [latest] = await sql<{ title: string }[]>`select title from proposals where declined_at is null order by created_at desc, id desc limit 1`;
  await notify(await publisherIds(), (t, locale) => ({ title: plural(t.bell.proposals, count, locale), body: latest?.title ?? "" }), { path: "/chest/proposals", key: proposalsKey });
}

export async function proposalApproved(sql: Sql, done: Approved): Promise<void> {
  await notify([done.author], t => ({ title: format(t.bell.approved, { title: cut(done.title, 60) }) }), { path: postPath(done.postId), key: proposalKey(done.proposalId) });
  await announce(sql);
  await proposalsWaiting(sql);
}

export async function proposalDeclined(sql: Sql, done: Declined): Promise<void> {
  if (!done.byAuthor) await notify([done.author], t => ({ title: format(t.bell.declined, { title: cut(done.title, 50) }), ...(done.reason ? { body: done.reason } : {}) }), { path: "/chest/propose", key: proposalKey(done.proposalId) });
  await proposalsWaiting(sql);
}

export async function proposalRestored(sql: Sql, proposalId: string, author: string): Promise<void> {
  await withdraw(proposalKey(proposalId), [author]);
  await proposalsWaiting(sql);
}
