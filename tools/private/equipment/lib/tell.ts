import type { Member } from "@argentic/chest-sdk/member";
import type { Query } from "./db.ts";
import { format, formatDay, plural } from "./i18n/index.ts";
import { badges, cut, notify, withdraw } from "./notify.ts";
import { managers } from "./people.ts";

// What Equipment tells people through the Chest's bell, each in their own
// language, and the number on the managers' tile (open problems). Every
// item is keyed, so a new one replaces the old one, and it is withdrawn
// once settled (the item taken back, the problem solved, the person's
// equipment all returned).
type Named = { id: string; name: string; tag: string };
const itemPath = (itemId: string) => `/chest/items/${itemId}`;

export async function given(actor: Member, holder: string, item: Named): Promise<void> {
  if (holder === actor.id || !holder.startsWith("mbr_")) return;
  await notify([holder], t => ({ title: format(t.bell.given, { name: actor.firstName || actor.name, item: cut(item.name, 40), tag: item.tag }), body: t.bell.givenBody }), { path: itemPath(item.id), key: `item:${item.id}:given` });
}

export async function seatGiven(actor: Member, holder: string, item: Named): Promise<void> {
  if (holder === actor.id) return;
  await notify([holder], t => ({ title: format(t.bell.seat, { name: actor.firstName || actor.name, item: cut(item.name, 50) }) }), { path: itemPath(item.id), key: `item:${item.id}:seat` });
}

export async function takenBack(holder: string, itemId: string): Promise<void> {
  if (!holder.startsWith("mbr_")) return;
  await withdraw(`item:${itemId}:given`, [holder]);
  await withdraw(`item:${itemId}:seat`, [holder]);
}

export async function reported(sql: Query, reporter: Member, item: Named, problem: { id: string; body: string }): Promise<void> {
  const to = (await managers()).filter(id => id !== reporter.id);
  await notify(to, t => ({ title: format(t.bell.reported, { name: reporter.firstName || reporter.name, item: cut(item.name, 30), tag: item.tag }), body: cut(problem.body, 280) }), { path: itemPath(item.id), key: `problem:${problem.id}` });
  await refreshBadges(sql);
}

export async function solved(sql: Query, problemId: string): Promise<void> {
  await withdraw(`problem:${problemId}`);
  await refreshBadges(sql);
}

// Someone left the company holding things: every manager hears it once
// (the item goes when all is back).
export async function left(person: { id: string; name: string }, count: number): Promise<void> {
  if (count === 0) return;
  const to = await managers();
  await notify(to, (t, locale) => ({
    title: person.name ? plural(t.bell.left, count, locale, { name: cut(person.name, 30) }) : plural(t.bell.leftUnnamed, count, locale),
    body: t.bell.leftBody,
  }), { path: `/chest/people/${person.id}`, key: `left:${person.id}` });
}

// Someone is leaving (People told Equipment): every manager hears it once,
// "Marc Lefort leaves on 12 Oct — 3 items to take back"; the item goes when
// all is back, when the departure is taken back, or when the person has
// left (then "left and holds" says the rest).
export async function leaving(person: { id: string; name: string }, lastDay: string, count: number): Promise<void> {
  if (count === 0) {
    await withdraw(`leaving:${person.id}`);
    return;
  }
  const to = await managers();
  await notify(to, (t, locale) => ({
    title: plural(person.name ? t.bell.leaving : t.bell.leavingUnnamed, count, locale, { name: cut(person.name, 30), date: formatDay(lastDay, locale, { day: "numeric", month: "short" }) }),
    body: t.bell.leavingBody,
  }), { path: `/chest/people/${person.id}`, key: `leaving:${person.id}` });
}

export async function stays(memberId: string): Promise<void> {
  await withdraw(`leaving:${memberId}`);
}

// When the person holds nothing more, the "left and holds" (or "leaves on")
// item goes.
export async function maybeAllBack(sql: Query, holder: string): Promise<void> {
  if (!holder.startsWith("mbr_")) return;
  const [row] = await sql<{ n: number }[]>`
    select ((select count(*) from items where holder = ${holder} and deleted_at is null) + (select count(*) from seats where member_id = ${holder}))::int as n`;
  if ((row?.n ?? 0) === 0) {
    await withdraw(`left:${holder}`);
    await withdraw(`leaving:${holder}`);
  }
}

// The weekly word to managers (schedule "weekly"): what ends soon.
export async function endingSoon(names: string[]): Promise<void> {
  if (names.length === 0) {
    await withdraw("ending");
    return;
  }
  const to = await managers();
  await notify(to, (t, locale) => ({ title: plural(t.bell.ending, names.length, locale), body: cut(names.join(" · "), 280) }), { path: "/chest#ending", key: "ending" });
}

// The managers' tile: how many problems wait for them.
export async function refreshBadges(sql: Query): Promise<void> {
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from problems p join items i on i.id = p.item_id where p.solved_at is null and i.deleted_at is null`;
  const count = row?.n ?? 0;
  const to = await managers();
  if (to.length > 0) await badges(new Map(to.map(id => [id, count])));
}
