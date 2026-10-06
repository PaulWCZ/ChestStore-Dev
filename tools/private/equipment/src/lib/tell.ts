import { chest } from "@argentic/chest-sdk/chest";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as mail from "@argentic/chest-sdk/mail";
import type { Member } from "@argentic/chest-sdk/member";
import type { Query } from "./db.ts";
import { format, formatDay, plural } from "../i18n/index.ts";
import { badges, cut, notify, withdraw } from "./notify.ts";
import { managers, people } from "./people.ts";
import { catalogue } from "../i18n/index.ts";

// What Equipment tells people through the Chest's bell, each in their own
// language, and the number on the managers' tile (open problems). Every
// item is keyed, so a new one replaces the old one, and it is withdrawn
// once settled (the item taken back, the problem solved, the person's
// equipment all returned).
type Named = { id: string; name: string; tag: string };
type Stocked = Named & { quantity: number | null; minQuantity: number | null; status: string };
const itemPath = (itemId: string) => `/chest/items/${itemId}`;

export async function given(actor: Member, holder: string, item: Named): Promise<void> {
  if (holder === actor.id || !holder.startsWith("mbr_")) return;
  await notify([holder], t => ({ title: format(t.bell.given, { name: actor.firstName || actor.name, item: cut(item.name, 40), tag: item.tag }), body: t.bell.givenBody }), { path: "/chest/mine", key: `item:${item.id}:given` });
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

// The number on the tool's tile: for managers, the problems and requests
// waiting for them; for everyone, the things they hold and have not yet
// confirmed receiving. Set for the managers and for the members named.
export async function refreshBadges(sql: Query, members: (string | null | undefined)[] = []): Promise<void> {
  const [row] = await sql<{ n: number }[]>`
    select ((select count(*) from problems p join items i on i.id = p.item_id where p.solved_at is null and i.deleted_at is null)
      + (select count(*) from requests where status = 'open'))::int as n`;
  const waiting = row?.n ?? 0;
  const to = await managers();
  const ids = [...new Set([...to, ...members.filter((m): m is string => typeof m === "string" && m.startsWith("mbr_"))])];
  if (ids.length === 0) return;
  const pending = await sql<{ member_id: string; n: number }[]>`
    select r.member_id, count(*)::int as n from receipts r join items i on i.id = r.item_id
    where r.member_id = any(${ids}) and r.confirmed_at is null and r.closed_at is null and i.holder = r.member_id and i.deleted_at is null
    group by r.member_id`;
  const mine = new Map(pending.map(p => [p.member_id, p.n]));
  await badges(new Map(ids.map(id => [id, (to.includes(id) ? waiting : 0) + (mine.get(id) ?? 0)])));
}

// Stock of a thing counted in bulk: when it falls to its minimum or under,
// the managers hear it once; restocked above it, the word goes.
export async function stockLevel(after: Stocked, before: Stocked): Promise<void> {
  const low = (i: Stocked) => i.status !== "retired" && i.minQuantity !== null && i.quantity !== null && i.quantity <= i.minQuantity;
  if (low(after) && (!low(before) || after.quantity! < before.quantity!)) {
    const to = await managers();
    await notify(to, (t, locale) => ({ title: plural(t.bell.low, after.quantity!, locale, { item: cut(after.name, 40) }), body: t.bell.lowBody }), { path: itemPath(after.id), key: `low:${after.id}` });
  } else if (!low(after) && low(before)) await withdraw(`low:${after.id}`);
}

// Someone confirmed receiving an item and noted something about it: the
// managers hear it (the remark is kept on the receipt and in the history).
export async function receivedWithRemark(person: Member, item: Named, remark: string): Promise<void> {
  const to = (await managers()).filter(id => id !== person.id);
  await notify(to, t => ({ title: format(t.bell.remark, { name: person.firstName || person.name, item: cut(item.name, 30), tag: item.tag }), body: cut(remark, 280) }), { path: itemPath(item.id), key: `remark:${item.id}` });
}

// A request for equipment: the managers hear it; the one who asked hears the
// answer. Each bell item goes once settled.
export async function requested(sql: Query, person: Member, request: { id: string; body: string }): Promise<void> {
  const to = (await managers()).filter(id => id !== person.id);
  await notify(to, t => ({ title: format(t.bell.requested, { name: person.firstName || person.name }), body: cut(request.body, 280) }), { path: "/chest#requests", key: `request:${request.id}` });
  await refreshBadges(sql);
}

export async function answered(sql: Query, actor: Member, request: { id: string; member: string; body: string; status: "approved" | "refused" | "done" | "cancelled"; answer: string | null; item?: Named | null }): Promise<void> {
  await withdraw(`request:${request.id}`);
  await refreshBadges(sql);
  if (request.status === "cancelled" || request.member === actor.id || !request.member.startsWith("mbr_")) return;
  const status = request.status;
  await notify([request.member], t => ({
    title: format(t.bell.answer[status], { name: actor.firstName || actor.name, what: cut(request.body, 40), item: request.item ? cut(request.item.name, 40) : "" }),
    ...(request.answer ? { body: cut(request.answer, 280) } : {}),
  }), { path: status === "done" && request.item ? itemPath(request.item.id) : "/chest", key: `request:${request.id}:answer` });
}

// "Remind them": the holder of a receipt still waiting hears it again, in
// the bell (the same item as when it was given, rung again) and — where
// the Chest sends email (the "mail" proposal, chest.proposals.json) — by
// email to their address, which the tool never knows. Says whether the
// email left: on a Chest without mail, the bell alone, and nothing fails.
export async function remindReceipt(actor: Member, holder: string, item: Named, givenOn: string): Promise<boolean> {
  const by = actor.firstName || actor.name;
  await notify([holder], t => ({ title: format(t.bell.remind, { name: by, item: cut(item.name, 40), tag: item.tag }), body: t.bell.givenBody }), { path: "/chest/mine", key: `item:${item.id}:given` });
  const person = (await people([holder])).get(holder);
  if (!person || person.status !== "member") return false;
  const t = catalogue(person.locale);
  const date = formatDay(givenOn, person.locale, { day: "numeric", month: "long", year: "numeric" });
  try {
    await mail.send({
      to: { member: holder },
      subject: cut(format(t.mail.remindSubject, { item: item.name }), 120),
      text: [format(t.mail.remindText, { name: actor.name, item: item.name, tag: item.tag, date }), "", "—", t.mail.why].join("\n"),
      // The recipient in the key (studio.16): after a restore from a
      // backup, an item's id can name another thing given to someone else.
      key: `remind:${item.id}:${holder}:${givenOn}:${chest.today()}`,
    });
    return true;
  } catch (error) {
    if (error instanceof ChestError) return false;
    throw error;
  }
}
