import { ChestError } from "@argentic/chest-sdk/errors";
import type { Member } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import type { Query } from "./db.ts";
import { format, plural } from "../i18n/index.ts";
import { badges, cut, notify, withdraw } from "./notify.ts";
import { orphans } from "./orphans.ts";
import { people as lookup } from "./people.ts";
import { waitingCounts, waitingTitles } from "./read.ts";
import { today, weekStart } from "./time.ts";

// What Goals tells people through the Chest's bell, each in their own
// language, and the number on its tile: the key results waiting for my
// check-in this week. Keyed notifications replace each other and go away
// once settled.

const objectivePath = (objectiveId: string) => `/chest/objectives/${objectiveId}`;

export function clockAt(now: Date = new Date()) {
  return { now, weekStart: weekStart(now), today: today(now) };
}

// The tile's number of these members (null: everyone who owns a key
// result in a cycle not closed), and the reminder withdrawn from those who
// have nothing left to do this week.
export async function refreshBadges(sql: Query, owners: string[] | null, now: Date = new Date()): Promise<Map<string, number>> {
  const clock = clockAt(now);
  let people = owners;
  if (people === null) {
    people = (await sql<{ owner: string }[]>`
      select distinct k.owner from key_results k join objectives o on o.id = k.objective_id join cycles y on y.id = o.cycle_id
      where k.archived_at is null and o.archived_at is null and y.closed_at is null and k.owner like 'mbr\\_%' limit 5000`).map(r => r.owner);
  }
  people = [...new Set(people)].filter(p => p.startsWith("mbr_"));
  if (people.length === 0) return new Map();
  // Only people here have a tile: someone who left is told nothing.
  const found = await lookup(people);
  people = people.filter(p => found.get(p)?.status === "member");
  if (people.length === 0) return new Map();
  const counts = await waitingCounts(sql, people, clock);
  await badges(counts);
  const settled = [...counts].filter(([, n]) => n === 0).map(([id]) => id);
  for (let i = 0; i < settled.length; i += 500) await withdraw("checkin", settled.slice(i, i + 500));
  return counts;
}

// Friday morning (schedule "reminder"): whoever still has key results
// waiting this week finds one item in their bell, in their language —
// "3 key results wait for your weekly check-in" — replacing last week's.
// Idempotent: a run delivered twice sends the same item under the same key.
export async function weeklyReminder(sql: Query, now: Date): Promise<number> {
  const clock = clockAt(now);
  const counts = await refreshBadges(sql, null, now);
  let told = 0;
  for (const [owner, n] of counts) {
    if (n === 0) continue;
    const titles = await waitingTitles(sql, owner, clock);
    await notify([owner], (t, locale) => ({ title: plural(t.bell.reminder, n, locale), body: cut(titles.join(" · "), 280) }), { path: "/chest", key: "checkin" });
    told++;
  }
  return told;
}

export async function keyResultGiven(actor: Member, owner: string, keyResult: { title: string; objectiveId: string }): Promise<void> {
  if (owner === actor.id) return;
  await notify([owner], t => ({ title: format(t.bell.keyResultGiven, { name: actor.name }), body: keyResult.title }), { path: objectivePath(keyResult.objectiveId), key: `obj:${keyResult.objectiveId}:given` });
}

export async function objectiveGiven(actor: Member, owner: string, objective: { id: string; title: string }): Promise<void> {
  if (owner === actor.id) return;
  await notify([owner], t => ({ title: format(t.bell.objectiveGiven, { name: actor.name }), body: objective.title }), { path: objectivePath(objective.id), key: `obj:${objective.id}:given` });
}

// Someone chosen to see a confidential objective hears of it.
export async function shared(actor: Member, viewers: string[], objective: { id: string; title: string }): Promise<void> {
  const others = viewers.filter(v => v !== actor.id);
  if (others.length === 0) return;
  await notify(others, t => ({ title: format(t.bell.shared, { name: actor.name }), body: objective.title }), { path: objectivePath(objective.id), key: `obj:${objective.id}:shared` });
}

export async function commented(actor: Member, recipients: string[], objective: { id: string; title: string }, body: string): Promise<void> {
  const others = [...new Set(recipients)].filter(r => r !== actor.id && r.startsWith("mbr_"));
  if (others.length === 0) return;
  await notify(others, t => ({ title: format(t.bell.commented, { name: actor.name, objective: cut(objective.title, 40) }), body: cut(body, 280) }), { path: objectivePath(objective.id) + "#comments", key: `obj:${objective.id}:comment` });
}

// The admins hear, once and kept up to date, how many goals wait for a new
// owner; the item goes when none is left.
export async function tellAdminsOfOrphans(sql: Query): Promise<void> {
  const count = (await orphans(sql)).length;
  if (count === 0) return withdraw("orphans");
  let admins: string[] = [];
  try {
    let after: string | undefined;
    do {
      const page = await members.list({ role: "admin", limit: 500, ...(after ? { after } : {}) });
      admins = [...admins, ...page.members.map(m => m.id)];
      after = page.next ?? undefined;
    } while (after && admins.length < 2000);
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
  await notify(admins, (t, locale) => ({ title: plural(t.bell.orphans, count, locale), body: t.bell.orphansBody }), { path: "/chest/settings#owners", key: "orphans" });
}
