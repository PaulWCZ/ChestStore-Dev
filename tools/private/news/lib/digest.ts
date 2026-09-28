import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import type { Locale } from "@argentic/chest-sdk/member";
import * as notifications from "@argentic/chest-sdk/notifications";
import { inAudience } from "./access.ts";
import { page, maxPages, type Reader } from "./audience.ts";
import type { Sql } from "./db.ts";
import { catalogue, plural } from "./i18n/index.ts";
import { cut, withdraw } from "./notify.ts";
import { today } from "./time.ts";

// The weekly digest (schedule "digest", Monday morning in the Chest's time
// zone, Proposal (studio)): each person who has News finds one item in
// their bell — "This week: 3 posts you haven't seen yet" and their
// headlines — in their own language, only when there is something.
//
// "Not seen" is what News can know without recording who opened what
// (README, "Works council"): a post of the last 7 days, for them (its
// audience), not their own, published after their last visit to the front
// page, and — when Important — not confirmed.
//
// One key for everyone ("digest"): next week's replaces this week's, never
// doubles it; it is withdrawn when the person opens the front page. The
// Chest takes 1,000 recipients an hour: beyond, the run keeps where it
// stopped (digest_runs.after) and the "publish" pass goes on with it within
// the same week.
export const digestKey = "digest";
const week = 7 * 864e5;

type Candidate = { id: string; title: string; author: string; important: boolean; publish_at: Date; groups: string[] };

// mondayOf is the Monday of the week of an instant, on the Chest's clock.
export function mondayOf(instant: Date, zone: string): string {
  const day = today(zone, instant);
  const date = new Date(day + "T12:00:00Z");
  const back = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - back * 864e5).toISOString().slice(0, 10);
}

// unseenFor lists, for each person, the posts they have not seen: pure, so
// the rule is tested alone. seenAt: their last visit (none: never came).
export function unseenFor(person: Pick<Reader, "id" | "groups">, posts: Candidate[], seenAt: Date | null, confirmed: Set<string>): Candidate[] {
  return posts.filter(p =>
    p.author !== person.id &&
    inAudience(person, p) &&
    (seenAt === null || p.publish_at.getTime() > seenAt.getTime()) &&
    !(p.important && confirmed.has(p.id + ":" + person.id)));
}

// startDigest begins the week of a run (a run delivered twice begins it
// once), then tells as much as the Chest takes.
export async function startDigest(sql: Sql, run: { scheduledAt: string; timeZone: string }, now = new Date()): Promise<void> {
  const at = new Date(run.scheduledAt);
  const monday = mondayOf(at, run.timeZone);
  await sql`insert into digest_runs (week, from_at, to_at) values (${monday}, ${new Date(at.getTime() - week)}, ${at}) on conflict (week) do nothing`;
  await continueDigest(sql, now, monday);
}

// continueDigest goes on with this week's run, if one is under way. A run
// of an earlier week not finished is dropped: its news is stale.
export async function continueDigest(sql: Sql, now = new Date(), monday?: string): Promise<"done" | "waiting" | "none"> {
  const [run] = await sql<{ week: string; from_at: Date; to_at: Date; after: string | null }[]>`
    update digest_runs set lease = ${now}
    where done_at is null and (lease is null or lease < ${now}::timestamptz - interval '2 minutes')
      and ${monday ? sql`week = ${monday}` : sql`week = (select max(week) from digest_runs) and to_at > ${now}::timestamptz - interval '6 days'`}
    returning to_char(week, 'YYYY-MM-DD') as week, from_at, to_at, after`;
  if (!run) return "none";
  const posts = (await sql<Candidate[]>`
    select p.id, p.title, p.author, p.important, p.publish_at, array(select g.group_id from post_groups g where g.post_id = p.id) as groups
    from posts p where p.deleted_at is null and p.publish_at > ${run.from_at} and p.publish_at <= ${run.to_at}
    order by p.pinned_at desc nulls last, p.publish_at desc, p.id desc`).map(p => ({ ...p, id: String(p.id) }));
  let after = run.after;
  for (let i = 0; i < maxPages; i++) {
    const result = await tellPage(sql, posts, after);
    if (result === "stopped") {
      await sql`update digest_runs set after = ${after}, lease = null where week = ${run.week}`;
      return "waiting";
    }
    if (result === "done") break;
    after = result;
    await sql`update digest_runs set after = ${after} where week = ${run.week}`;
  }
  await sql`update digest_runs set done_at = ${now}, after = null, lease = null where week = ${run.week}`;
  return "done";
}

// tellPage tells one page of members: the next cursor, "done" after the
// last page, "stopped" when the Chest refused (quota, unreachable).
async function tellPage(sql: Sql, posts: Candidate[], after: string | null): Promise<string | "done" | "stopped"> {
  let found;
  try {
    found = await page(after);
  } catch (error) {
    if (error instanceof CapabilityNotGranted) return "done";
    if (error instanceof ChestError) return "stopped";
    throw error;
  }
  const ids = found.people.map(p => p.id);
  const seen = new Map<string, Date>();
  const confirmed = new Set<string>();
  const holding = new Set<string>();
  if (ids.length > 0) {
    for (const v of await sql<{ member: string; seen_at: Date }[]>`select member, seen_at from visits where member in ${sql(ids)}`) seen.set(v.member, v.seen_at);
    const important = posts.filter(p => p.important).map(p => p.id);
    if (important.length > 0) for (const c of await sql<{ post_id: string; member: string }[]>`select post_id, member from confirmations where post_id in ${sql(important)} and member in ${sql(ids)}`) confirmed.add(String(c.post_id) + ":" + c.member);
    for (const d of await sql<{ member: string }[]>`select member from digests where member in ${sql(ids)}`) holding.add(d.member);
  }
  // Everyone with the same news in the same language gets one call.
  const batches = new Map<string, { locale: Locale; posts: Candidate[]; people: string[] }>();
  const nothing: string[] = [];
  for (const person of found.people) {
    const unseen = unseenFor(person, posts, seen.get(person.id) ?? null, confirmed);
    if (unseen.length === 0) {
      if (holding.has(person.id)) nothing.push(person.id);
      continue;
    }
    const key = person.locale + ":" + unseen.map(p => p.id).join(",");
    const batch = batches.get(key) ?? { locale: person.locale, posts: unseen, people: [] };
    batch.people.push(person.id);
    batches.set(key, batch);
  }
  // Last week's item goes for those with nothing new this week.
  if (nothing.length > 0) {
    await withdraw(digestKey, nothing);
    await sql`delete from digests where member in ${sql(nothing)}`;
  }
  for (const batch of batches.values()) {
    const t = catalogue(batch.locale);
    try {
      await notifications.notify(batch.people, {
        title: cut(plural(t.bell.digest, batch.posts.length, batch.locale), 80),
        body: cut(batch.posts.map(p => p.title).join(" · "), 280),
        path: "/chest",
        key: digestKey,
      });
    } catch (error) {
      if (error instanceof CapabilityNotGranted) return "done";
      if (error instanceof ChestError) return "stopped";
      throw error;
    }
    await sql`insert into digests ${sql(batch.people.map(member => ({ member, sent_at: new Date() })))} on conflict (member) do update set sent_at = excluded.sent_at`;
  }
  return found.next ?? "done";
}

// seenDigest: the person opened the front page; their digest item goes.
export async function seenDigest(sql: Sql, memberId: string): Promise<void> {
  const [held] = await sql`delete from digests where member = ${memberId} returning member`;
  if (held) await withdraw(digestKey, [memberId]);
}
